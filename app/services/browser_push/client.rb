# frozen_string_literal: true

require "web-push"

# Web Push (RFC 8030 + VAPID) for the installable mobile web app. Unlike APNs
# it needs no Apple credentials, so it works on self-hosted servers once VAPID
# keys are set. Mirrors Apns::Client's interface so PushSubscription::Delivery
# can treat both the same way.
module BrowserPush
  class Client
    UnavailableError = Class.new(Apns::Client::UnavailableError)
    ConfigurationError = Class.new(Apns::Client::ConfigurationError)
    TransientError = Class.new(Apns::Client::TransientError)

    Response = Data.define(:status, :body) do
      def ok?
        (200..299).cover?(status)
      end
    end

    def self.available?
      public_key.present? && ENV["WEB_PUSH_VAPID_PRIVATE_KEY"].present?
    end

    def self.public_key
      ENV["WEB_PUSH_VAPID_PUBLIC_KEY"].presence
    end

    def initialize(subscription)
      @subscription = subscription
    end

    def deliver(token:, title:, body:, insight_id:)
      push(title: title, body: body, url: "/m/assistant", tag: "insight-#{insight_id}", ttl: 1.hour)
    end

    def deliver_test(token:, title:, body:, request_id:)
      push(title: title, body: body, url: "/m", tag: "test-#{request_id}", ttl: 5.minutes)
    end

    private
      attr_reader :subscription

      def push(title:, body:, url:, tag:, ttl:)
        raise UnavailableError, "Web Push is unavailable" unless self.class.available?

        result = WebPush.payload_send(
          message: { title: title, body: body, url: url, tag: tag }.to_json,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth_secret,
          ttl: ttl.to_i,
          urgency: "normal",
          vapid: {
            subject: ENV["WEB_PUSH_VAPID_SUBJECT"].presence || "mailto:support@example.com",
            public_key: self.class.public_key,
            private_key: ENV["WEB_PUSH_VAPID_PRIVATE_KEY"]
          }
        )
        Response.new(status: result.code.to_i, body: nil)
      rescue WebPush::ExpiredSubscription, WebPush::InvalidSubscription
        Response.new(status: 410, body: nil)
      rescue WebPush::TooManyRequests, WebPush::PushServiceError => e
        status = e.response&.code.to_i
        raise TransientError, "Push service temporarily rejected the request (#{status})" if status == 429 || status >= 500

        Response.new(status: status.positive? ? status : 400, body: nil)
      rescue WebPush::PayloadTooLarge
        Response.new(status: 413, body: nil)
      rescue WebPush::Unauthorized, WebPush::ConfigurationError, ArgumentError, OpenSSL::PKey::PKeyError
        raise ConfigurationError, "Web Push VAPID configuration is invalid"
      rescue IOError, SystemCallError, Timeout::Error, SocketError, OpenSSL::SSL::SSLError
        raise TransientError, "Push service connection failed"
      end
  end
end
