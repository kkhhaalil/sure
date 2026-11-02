require "test_helper"

class Api::V1::InsightsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @user.update!(preferences: @user.preferences.merge("preview_features_enabled" => true))
    key = ApiKey.generate_secure_key
    @api_key = ApiKey.create!(
      user: @user,
      name: "Native insights test",
      key: key,
      scopes: [ "read" ],
      source: "mobile"
    )
    @insight = @user.family.insights.create!(
      insight_type: "idle_cash",
      priority: "medium",
      status: "active",
      title: "Put idle cash to work",
      body: "One account has more cash than usual.",
      generated_at: Time.current,
      dedup_key: "native-insights-test"
    )
  end

  test "lists visible family insights" do
    get api_v1_insights_url, headers: api_headers(@api_key)

    assert_response :success
    payload = response.parsed_body
    row = payload.fetch("insights").find { |insight| insight.fetch("id") == @insight.id }
    assert_equal "idle_cash", row.fetch("type")
    assert_equal "Put idle cash to work", row.fetch("title")
  end

  test "rejects requests without an API key" do
    get api_v1_insights_url

    assert_response :unauthorized
  end

  test "does not expose insights when the API key owner opted out of preview features" do
    @user.update!(preferences: @user.preferences.merge("preview_features_enabled" => false))

    get api_v1_insights_url, headers: api_headers(@api_key)

    assert_response :forbidden
    assert_equal "feature_disabled", response.parsed_body.fetch("error")
  end

  test "exposes the insight's period and facts" do
    @insight.update!(period_start: Date.new(2026, 10, 1), period_end: Date.new(2026, 10, 31), facts: { "category_id" => "abc" })

    get api_v1_insights_url, headers: api_headers(@api_key)

    row = response.parsed_body.fetch("insights").find { |insight| insight.fetch("id") == @insight.id }
    assert_equal "2026-10-01", row.fetch("period_start")
    assert_equal "2026-10-31", row.fetch("period_end")
    assert_equal({ "category_id" => "abc" }, row.fetch("facts"))
  end

  test "marks an insight read" do
    patch api_v1_insight_url(@insight), params: { status: "read" }, headers: api_headers(insight_write_key)

    assert_response :success
    assert_equal "read", @insight.reload.status
    assert_not_nil @insight.read_at
    assert_equal "read", response.parsed_body.fetch("status")
  end

  test "dismisses an insight so it drops out of the list" do
    patch api_v1_insight_url(@insight), params: { status: "dismissed" }, headers: api_headers(insight_write_key)
    assert_response :success
    assert_not_nil @insight.reload.dismissed_at

    get api_v1_insights_url, headers: api_headers(insight_write_key)
    assert_not_includes response.parsed_body.fetch("insights").map { |i| i["id"] }, @insight.id
  end

  test "rejects an unknown insight status" do
    patch api_v1_insight_url(@insight), params: { status: "expired" }, headers: api_headers(insight_write_key)
    assert_response :unprocessable_entity
  end

  test "rejects insight updates with a read-only key" do
    patch api_v1_insight_url(@insight), params: { status: "read" }, headers: api_headers(@api_key)
    assert_response :forbidden
  end

  def insight_write_key
    @insight_write_key ||= ApiKey.create!(
      user: @user, name: "Insights write", key: ApiKey.generate_secure_key,
      scopes: [ "read_write" ], source: "web"
    )
  end
end
