# frozen_string_literal: true

class Api::V1::PushSubscriptionsController < Api::V1::BaseController
  before_action :ensure_write_scope
  before_action :require_push_available, only: :create

  def create
    return create_web_subscription if web_subscription?

    subscription = PushSubscription.register_for!(user: current_resource_owner,
      token: subscription_params[:token].to_s.downcase,
      environment: subscription_params[:environment], platform: subscription_params[:platform],
      device_key: subscription_params[:device_key])
    render json: serialize(subscription), status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: { error: "validation_error", message: e.record.errors.full_messages.to_sentence },
           status: :unprocessable_entity
  rescue ActiveRecord::RecordNotUnique
    render json: { error: "validation_error", message: "Device token is already registered" },
           status: :unprocessable_entity
  end

  def vapid_public_key
    if BrowserPush::Client.available?
      render json: { public_key: BrowserPush::Client.public_key }
    else
      render json: { error: "feature_disabled", message: "Web Push is not configured on this server" }, status: :not_found
    end
  end

  def destroy
    subscription = current_resource_owner.push_subscriptions.find(params[:id])
    unless subscription.web? || Apns::Client.hosted?
      render json: { error: "feature_disabled", message: "Push notifications are available only in hosted mode" },
             status: :forbidden
      return
    end

    subscription.destroy!
    head :no_content
  end

  private
    def web_subscription?
      params[:platform] == "web"
    end

    # APNs needs Apple credentials only the hosted service has; Web Push only
    # needs VAPID keys, so self-hosted servers can offer it.
    def require_push_available
      if web_subscription?
        return if BrowserPush::Client.available?

        render json: { error: "feature_disabled", message: "Web Push is not configured on this server" }, status: :forbidden
      else
        return if Apns::Client.hosted?

        render json: { error: "feature_disabled", message: "Push notifications are available only in hosted mode" },
               status: :forbidden
      end
    end

    def create_web_subscription
      keys = params.fetch(:keys, {}).permit(:p256dh, :auth)
      subscription = PushSubscription.register_web!(user: current_resource_owner, endpoint: params[:endpoint],
        p256dh: keys[:p256dh], auth_secret: keys[:auth])
      render json: serialize(subscription), status: :created
    rescue ActiveRecord::RecordInvalid => e
      render json: { error: "validation_error", message: e.record.errors.full_messages.to_sentence },
             status: :unprocessable_entity
    end

    def ensure_write_scope
      authorize_scope!(:write)
    end

    def subscription_params
      params.permit(:token, :environment, :platform, :device_key)
    end

    def serialize(subscription)
      {
        id: subscription.id,
        environment: subscription.environment,
        platform: subscription.platform,
        last_registered_at: subscription.last_registered_at.iso8601
      }
    end
end
