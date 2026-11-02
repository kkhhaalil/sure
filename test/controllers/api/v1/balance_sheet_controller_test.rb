# frozen_string_literal: true

require "test_helper"

class Api::V1::BalanceSheetControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @family = @user.family

    @user.api_keys.active.destroy_all

    @auth = ApiKey.create!(
      user: @user,
      name: "Test Read Key",
      scopes: [ "read" ],
      display_key: "test_ro_#{SecureRandom.hex(8)}",
      source: "mobile"
    )

    Redis.new.del("api_rate_limit:#{@auth.id}")
  end

  test "should require authentication" do
    get "/api/v1/balance_sheet"
    assert_response :unauthorized
  end

  test "should return balance sheet with net worth data" do
    get "/api/v1/balance_sheet", headers: api_headers(@auth)

    assert_response :success
    response_body = JSON.parse(response.body)

    assert response_body.key?("currency")
    assert response_body.key?("net_worth")
    assert response_body.key?("assets")
    assert response_body.key?("liabilities")

    %w[net_worth assets liabilities].each do |field|
      assert response_body[field].key?("amount"), "#{field} should have amount"
      assert response_body[field].key?("currency"), "#{field} should have currency"
      assert response_body[field].key?("formatted"), "#{field} should have formatted"
    end
  end

  test "series returns daily net worth for the requested period" do
    get "/api/v1/balance_sheet/series", params: { period: "last_30_days" }, headers: api_headers(@auth)

    assert_response :success
    body = JSON.parse(response.body)
    assert_equal @family.currency, body["currency"]
    assert_equal "last_30_days", body["period"]
    assert_operator body["points"].size, :>=, 2
    point = body["points"].last
    assert_equal %w[date net_worth net_worth_cents].sort, point.keys.sort
    assert_kind_of Integer, point["net_worth_cents"]
    assert_equal body["points"].map { |p| p["date"] }.sort, body["points"].map { |p| p["date"] }
  end

  test "series defaults to the last 30 days" do
    get "/api/v1/balance_sheet/series", headers: api_headers(@auth)

    assert_response :success
    assert_equal "last_30_days", JSON.parse(response.body)["period"]
  end

  test "series rejects an unknown period" do
    get "/api/v1/balance_sheet/series", params: { period: "forever" }, headers: api_headers(@auth)

    assert_response :unprocessable_entity
  end

  private

    def api_headers(auth)
      { "X-Api-Key" => auth.display_key }
    end
end
