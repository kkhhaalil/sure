# Serves the installable mobile web app under /m: a client-rendered shell
# that talks to /api/v1 with its own OAuth token. The shell and manifest are
# public so the app can show its own sign-in screen; a web session (password,
# passkey, SSO or MFA, through the existing web flows) is exchanged for an API
# token at session_token.
class MobileAppController < ApplicationController
  ASSET_DIR = Rails.root.join("public", "m-app")

  skip_authentication only: %i[show manifest service_worker]
  # The worker is same-origin JavaScript the browser fetches itself; the
  # cross-origin JS guard would otherwise reject it, as it does for /service-worker.
  skip_forgery_protection only: :service_worker
  skip_before_action :authenticate_user!, only: :session_token
  before_action :require_web_session, only: :session_token

  layout false

  def show
    @asset_version = asset_version
  end

  def manifest
    render formats: [ :json ], content_type: "application/manifest+json"
  end

  # Served from /m so its scope covers the whole app.
  def service_worker
    path = ASSET_DIR.join("sw.js")
    return head :not_found unless path.exist?

    response.headers["Service-Worker-Allowed"] = "/m"
    response.headers["Cache-Control"] = "no-cache"
    send_file path, type: "application/javascript", disposition: "inline"
  end

  def session_token
    device_id = params[:device_id].to_s.strip
    if device_id.blank?
      render json: { error: "validation_failed", message: "device_id is required" }, status: :unprocessable_entity
      return
    end

    user = Current.session.user
    device = MobileDevice.upsert_device!(user, {
      device_id: device_id,
      device_name: params[:device_name].presence || "Mobile web",
      device_type: "web",
      os_version: params[:os_version].presence || "web",
      app_version: params[:app_version].presence || "pwa"
    })

    render json: device.issue_token!.merge(user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, ai_enabled: user.ai_enabled? }),
           status: :created
  rescue User::InactiveError
    render json: { error: "unauthorized" }, status: :unauthorized
  end

  private
    def require_web_session
      session_record = Session.find_active_by_cookie(cookies.signed[:session_token])
      return render(json: { error: "unauthorized" }, status: :unauthorized) unless session_record

      Current.session = session_record
    end

    def asset_version
      entry = ASSET_DIR.join("index.js")
      entry.exist? ? entry.mtime.to_i : 0
    end
end
