require "test_helper"

class InstitutionIconTest < ActiveSupport::TestCase
  test "prefers the monochrome vector mark when the institution publishes one" do
    stub_request(:get, "https://cdn.simpleicons.org/hsbc")
      .to_return(status: 200, body: "<svg>#{'v' * 400}</svg>", headers: { "content-type" => "image/svg+xml" })

    result = InstitutionIcon.for("hsbc.com")

    assert_equal "image/svg+xml", result.content_type
    assert_includes result.body, "<svg>"
  end

  test "serves the bundled app-icon art for a brand that ships with one" do
    robinhood = InstitutionIcon.for("robinhood.com")
    assert_equal "image/svg+xml", robinhood.content_type
    assert_includes robinhood.body, "#CCFF00"

    wealthfront = InstitutionIcon.for("wealthfront.com")
    assert_equal "image/jpeg", wealthfront.content_type
    assert_operator wealthfront.body.bytesize, :>, 1000

    chase = InstitutionIcon.for("chase.com")
    assert_equal "image/png", chase.content_type
    assert_operator chase.body.bytesize, :>, 1000
  end

  test "falls back to favicons for institutions without a vector mark" do
    stub_request(:get, %r{google\.com/s2/favicons})
      .to_return(status: 200, body: "i" * 500, headers: { "content-type" => "image/png; charset=binary" })

    result = InstitutionIcon.for("fidelity.com")

    assert_equal 500, result.body.bytesize
    assert_equal "image/png", result.content_type
  end

  test "falls back to the next source when a source answers with a placeholder" do
    stub_request(:get, %r{google\.com/s2/favicons}).to_return(status: 200, body: "x", headers: { "content-type" => "image/png" })
    stub_request(:get, %r{icons\.duckduckgo\.com}).to_return(status: 200, body: "i" * 800, headers: { "content-type" => "image/x-icon" })

    result = InstitutionIcon.for("fidelity.com")

    assert_equal "image/x-icon", result.content_type
  end

  test "returns nil when nothing usable comes back" do
    stub_request(:get, %r{google\.com/s2/favicons}).to_return(status: 404, body: "")
    stub_request(:get, %r{icons\.duckduckgo\.com}).to_return(status: 500, body: "")

    assert_nil InstitutionIcon.for("unknown.example")
  end

  test "refuses a domain that is not a plain hostname" do
    assert_nil InstitutionIcon.for("chase.com/../../etc/passwd")
    assert_nil InstitutionIcon.for("")
  end

  test "signs a domain so the app can load the icon without a session cookie" do
    signature = InstitutionIcon.signature("chase.com")

    assert_equal "chase.com", InstitutionIcon.verified_domain(signature)
    assert_nil InstitutionIcon.verified_domain("forged")
    assert_nil InstitutionIcon.verified_domain(nil)
  end

  test "draws a lettermark for a domain with no icon" do
    lettermark = InstitutionIcon.lettermark("wellsfargo.com")

    assert_equal "image/svg+xml", lettermark.content_type
    assert_includes lettermark.body, ">W<"
  end
end
