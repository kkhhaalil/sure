# frozen_string_literal: true

require "test_helper"

class Api::V1::InvestmentsControllerTest < ActionDispatch::IntegrationTest
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

    @account = accounts(:investment)
  end

  test "requires authentication" do
    get "/api/v1/investments"
    assert_response :unauthorized
  end

  test "lists investment and crypto accounts only" do
    get "/api/v1/investments", headers: api_headers(@auth)

    assert_response :success
    body = JSON.parse(response.body)
    ids = body["accounts"].map { |a| a["id"] }
    assert_includes ids, @account.id
    assert_includes ids, accounts(:crypto).id
    assert_not_includes ids, accounts(:depository).id
    assert_equal "USD", body["currency"]
    assert_equal "last_30_days", body["period"]
    assert_kind_of Array, body["series"]
  end

  test "rolls holdings up by security with the latest value and the day's move" do
    get "/api/v1/investments", headers: api_headers(@auth)

    holding = JSON.parse(response.body)["holdings"].find { |h| h["security"]["ticker"] == "AAPL" }
    assert_equal "10.0", holding["qty"]
    assert_equal 215_000, holding["value_cents"]
    assert_equal 21_500, holding["price_cents"]
    # $214 yesterday to $215 today.
    assert_in_delta 0.47, holding["day_change_percent"].to_f, 0.01
    assert_equal [ 214_000, 215_000 ], holding["spark"]
  end

  test "splits allocation into securities and cash when nothing is classified" do
    get "/api/v1/investments", headers: api_headers(@auth)

    allocation = JSON.parse(response.body)["allocation"].index_by { |a| a["key"] }
    assert_equal 215_000, allocation["securities"]["value_cents"]
    assert allocation["cash"]["value_cents"] >= 500_000
    assert_in_delta 100.0, allocation.values.sum { |a| a["percent"].to_f }, 0.1
  end

  test "uses the asset class when a security has one" do
    securities(:aapl).update!(asset_class: "equity")

    get "/api/v1/investments", headers: api_headers(@auth)

    keys = JSON.parse(response.body)["allocation"].map { |a| a["key"] }
    assert_includes keys, "equity"
    assert_not_includes keys, "securities"
  end

  test "rejects an unknown period" do
    get "/api/v1/investments", params: { period: "forever" }, headers: api_headers(@auth)
    assert_response :unprocessable_entity
  end

  test "leaves out accounts the user cannot see" do
    other = families(:empty).accounts.create!(name: "Theirs", balance: 1, currency: "USD", accountable: Investment.new)

    get "/api/v1/investments", headers: api_headers(@auth)

    assert_not_includes JSON.parse(response.body)["accounts"].map { |a| a["id"] }, other.id
  end

  private

    def api_headers(api_key)
      { "X-Api-Key" => api_key.display_key }
    end
end
