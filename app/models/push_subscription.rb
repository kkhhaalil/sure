require "digest"

class PushSubscription < ApplicationRecord
  belongs_to :user

  enum :environment, { sandbox: "sandbox", production: "production" }, validate: true

  normalizes :token, with: ->(token) { token.downcase }

  # Keep hexadecimal tokens below PostgreSQL's B-tree entry limit for the
  # unique lower(token) index, even when the value cannot be compressed.
  validates :token, presence: true, uniqueness: { case_sensitive: false },
                    length: { maximum: 2048 },
                    format: { with: /\A(?:[0-9a-f]{2})+\z/i }
  validates :platform, inclusion: { in: %w[ios web] }
  validates :endpoint, :p256dh, :auth_secret, presence: true, if: :web?
  validates :endpoint, length: { maximum: 2048 }, if: :web?
  validate :endpoint_is_https_url, if: :web?
  validates :last_registered_at, presence: true

  # A per-installation secret proves continuity when the same device changes
  # users while its old subscription could not be removed (for example offline).
  # Never reuse a row ID across users: queued jobs and delayed deletes refer to it.
  def self.register_for!(user:, token:, environment:, platform:, device_key: nil)
    attempts = 0
    begin
      transaction(requires_new: true) do
        subscription = lock.find_by(token: token.downcase)
        candidate = new(user: user, token: token, environment: environment,
          platform: platform, last_registered_at: Time.current)
        if !device_key.nil? && !(device_key.is_a?(String) && device_key.match?(/\A[0-9a-f]{64}\z/))
          candidate.errors.add(:base, "Invalid device key")
          raise ActiveRecord::RecordInvalid, candidate
        end
        digest = Digest::SHA256.hexdigest(device_key) if device_key.present?
        if subscription && subscription.user_id != user.id
          unless digest && subscription.device_key_digest &&
              ActiveSupport::SecurityUtils.secure_compare(subscription.device_key_digest, digest)
            candidate.errors.add(:base, "Device token is already registered")
            raise ActiveRecord::RecordInvalid, candidate
          end
          subscription.destroy!
          subscription = nil
        end
        subscription ||= candidate
        subscription.assign_attributes(environment: environment, platform: platform, last_registered_at: Time.current)
        subscription.device_key_digest = digest if digest
        subscription.save!
        subscription
      end
    rescue ActiveRecord::RecordNotUnique
      attempts += 1
      retry if attempts < 2
      raise
    end
  end

  # A browser subscription is identified by its push service endpoint. The
  # token column keeps the shape the APNs path relies on (lowercase hex,
  # uniquely indexed) by holding the endpoint's SHA-256.
  def self.register_web!(user:, endpoint:, p256dh:, auth_secret:)
    token = Digest::SHA256.hexdigest(endpoint.to_s)
    transaction(requires_new: true) do
      subscription = lock.find_by(token: token)
      subscription.destroy! if subscription && subscription.user_id != user.id
      subscription = nil if subscription&.destroyed?

      subscription ||= new(user: user, token: token)
      subscription.assign_attributes(platform: "web", environment: "production", endpoint: endpoint,
        p256dh: p256dh, auth_secret: auth_secret, last_registered_at: Time.current)
      subscription.save!
      subscription
    end
  end

  def self.delivery_available?
    Apns::Client.available? || BrowserPush::Client.available?
  end

  scope :recent, -> { where("last_registered_at > ?", 90.days.ago) }

  def web?
    platform == "web"
  end

  def push_client_class
    web? ? BrowserPush::Client : Apns::Client
  end

  def build_push_client
    web? ? BrowserPush::Client.new(self) : Apns::Client.new(environment: environment)
  end

  def eligible?
    user.active? && last_registered_at > 90.days.ago
  end

  # A response may arrive after the app has registered again. Only remove the
  # exact registration sent, and respect APNs' invalidation timestamp when given.
  def invalidate_if_unchanged!(response)
    return unless response.status.to_i == 410

    timestamp = response.body.is_a?(Hash) && response.body["timestamp"]
    if timestamp
      return unless timestamp.is_a?(Numeric) && timestamp.positive? && timestamp.finite?
      return if last_registered_at.to_f * 1000 > timestamp
    end

    self.class.where(id: id, token: token, environment: environment,
      last_registered_at: last_registered_at).delete_all
  end

  private
    # Push services are always reached over HTTPS; anything else (or a value
    # that is not a URL at all) is refused before it can be posted to.
    def endpoint_is_https_url
      uri = URI.parse(endpoint.to_s)
      errors.add(:endpoint, "must be an https URL") unless uri.is_a?(URI::HTTPS) && uri.host.present?
    rescue URI::InvalidURIError
      errors.add(:endpoint, "must be an https URL")
    end
end
