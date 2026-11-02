require "test_helper"

class InstitutionIconsControllerTest < ActionDispatch::IntegrationTest
  setup do
    sign_in users(:family_admin)
  end

  test "serves the cached icon for an institution domain" do
    icon = InstitutionIcon::Result.new(body: "i" * 400, content_type: "image/png")
    InstitutionIcon.stubs(:for).with("chase.com").returns(icon)

    get institution_icon_path(institution: "chase.com")

    assert_response :success
    assert_equal "image/png", response.media_type
    assert_equal 400, response.body.bytesize
  end

  test "falls back to a lettermark when no icon can be fetched" do
    InstitutionIcon.stubs(:for).returns(nil)

    get institution_icon_path(institution: "unknown.example")

    assert_response :success
    assert_equal "image/svg+xml", response.media_type
    assert_includes response.body, ">U<"
  end
end

# Same endpoint, no session: it must not serve anything to an anonymous caller.
class InstitutionIconsControllerAuthenticationTest < ActionDispatch::IntegrationTest
  test "redirects to sign in" do
    InstitutionIcon.stubs(:for).never

    get institution_icon_path(institution: "chase.com")

    assert_redirected_to new_session_path
  end
end
