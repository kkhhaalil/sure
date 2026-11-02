require "test_helper"

class InstitutionIconsControllerTest < ActionDispatch::IntegrationTest
  test "serves the icon for a signed URL without a session" do
    icon = InstitutionIcon::Result.new(body: "i" * 400, content_type: "image/png")
    InstitutionIcon.stubs(:for).with("chase.com").returns(icon)

    get institution_icon_path(institution: "chase.com", sig: InstitutionIcon.signature("chase.com"))

    assert_response :success
    assert_equal "image/png", response.media_type
    assert_equal 400, response.body.bytesize
  end

  test "refuses a URL whose signature is missing or was issued for another domain" do
    InstitutionIcon.stubs(:for).never

    get institution_icon_path(institution: "chase.com", sig: InstitutionIcon.signature("other.example"))
    assert_response :not_found

    get institution_icon_path(institution: "chase.com")
    assert_response :not_found
  end

  test "falls back to a lettermark when no icon can be fetched" do
    InstitutionIcon.stubs(:for).returns(nil)

    get institution_icon_path(institution: "unknown.example", sig: InstitutionIcon.signature("unknown.example"))

    assert_response :success
    assert_equal "image/svg+xml", response.media_type
    assert_includes response.body, ">U<"
  end
end
