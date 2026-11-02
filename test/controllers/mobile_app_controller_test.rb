require "test_helper"

class MobileAppControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
  end

  test "serves the app shell without a session so the app can show its own sign-in" do
    get "/m"

    assert_response :success
    assert_select "div#sure-mobile-root"
    assert_select "link[rel=manifest][href=?]", "/m/manifest.webmanifest"
    assert_select "meta[name=viewport][content*=?]", "viewport-fit=cover"
  end

  test "serves the app shell for client-side routes" do
    get "/m/transactions/123"

    assert_response :success
    assert_select "div#sure-mobile-root"
  end

  test "manifest installs the mobile app standalone under /m" do
    get "/m/manifest.webmanifest"

    assert_response :success
    assert_equal "application/manifest+json", response.media_type
    manifest = JSON.parse(response.body)
    assert_equal "/m", manifest["start_url"]
    assert_equal "/m", manifest["scope"]
    assert_equal "standalone", manifest["display"]
    assert manifest["icons"].any?
  end

  test "session token exchanges a signed-in web session for an API token" do
    sign_in @user

    post "/m/session_token", params: { device_id: "pwa-test-device", device_name: "iPhone Safari" }, as: :json

    assert_response :created
    body = JSON.parse(response.body)
    assert body["access_token"].present?
    assert body["refresh_token"].present?
    assert_equal @user.id, body.dig("user", "id")

    device = @user.mobile_devices.find_by!(device_id: "pwa-test-device")
    assert_equal "web", device.device_type

    get "/api/v1/accounts", headers: { "Authorization" => "Bearer #{body["access_token"]}" }
    assert_response :success
  end

  test "session token requires a web session" do
    post "/m/session_token", params: { device_id: "pwa-test-device" }, as: :json

    assert_response :unauthorized
  end

  test "session token requires a device id" do
    sign_in @user

    post "/m/session_token", params: {}, as: :json

    assert_response :unprocessable_entity
  end

  test "serves the service worker with a scope covering /m" do
    sw = MobileAppController::ASSET_DIR.join("sw.js")
    created = !sw.exist?
    if created
      FileUtils.mkdir_p(sw.dirname)
      File.write(sw, "self.addEventListener('fetch', () => {});")
    end

    get "/m/sw.js", headers: { "Accept" => "*/*" }

    assert_response :success
    assert_equal "application/javascript", response.media_type
    assert_equal "/m", response.headers["Service-Worker-Allowed"]
  ensure
    FileUtils.rm_f(sw) if created
  end
end
