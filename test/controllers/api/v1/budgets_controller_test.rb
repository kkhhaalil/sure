# frozen_string_literal: true

require "test_helper"

class Api::V1::BudgetsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @family = @user.family
    @user.api_keys.active.destroy_all

    @api_key = ApiKey.create!(
      user: @user,
      name: "Test Read Key",
      scopes: [ "read" ],
      source: "web",
      display_key: "test_read_#{SecureRandom.hex(8)}"
    )

    @budget = @family.budgets.create!(
      start_date: 3.months.ago.beginning_of_month.to_date,
      end_date: 3.months.ago.end_of_month.to_date,
      budgeted_spending: 3000,
      expected_income: 5000,
      currency: "USD"
    )

    category = categories(:food_and_drink)
    @budget_category = @budget.budget_categories.create!(
      category: category,
      budgeted_spending: 500,
      currency: "USD"
    )

    other_family = families(:empty)
    @other_budget = other_family.budgets.create!(
      start_date: 4.months.ago.beginning_of_month.to_date,
      end_date: 4.months.ago.end_of_month.to_date,
      budgeted_spending: 1000,
      expected_income: 2000,
      currency: "USD"
    )
  end

  test "lists budgets scoped to the current family" do
    get api_v1_budgets_url, headers: api_headers(@api_key)

    assert_response :success
    response_data = JSON.parse(response.body)
    assert response_data.key?("budgets")
    assert response_data.key?("pagination")
    assert_includes response_data["budgets"].map { |budget| budget["id"] }, @budget.id
    assert_not_includes response_data["budgets"].map { |budget| budget["id"] }, @other_budget.id

    budget_response = response_data["budgets"].find { |budget| budget["id"] == @budget.id }
    %w[
      actual_spending
      actual_spending_cents
      actual_income
      actual_income_cents
      available_to_spend
      available_to_spend_cents
      available_to_allocate
      available_to_allocate_cents
    ].each do |derived_field|
      assert_not budget_response.key?(derived_field), "Expected budget index to omit #{derived_field}"
    end
  end

  test "shows a budget" do
    get api_v1_budget_url(@budget.id), headers: api_headers(@api_key)

    assert_response :success
    response_data = JSON.parse(response.body)
    assert_equal @budget.id, response_data["id"]
    assert_equal @budget.start_date.to_s, response_data["start_date"]
    assert_equal "USD", response_data["currency"]
    assert_equal true, response_data["initialized"]
    assert_kind_of Integer, response_data["budgeted_spending_cents"]
    assert_kind_of Integer, response_data["actual_spending_cents"]
    assert_kind_of Integer, response_data["actual_income_cents"]
    assert_kind_of Integer, response_data["available_to_spend_cents"]
    assert_kind_of Integer, response_data["available_to_allocate_cents"]
  end

  test "returns not found for another family's budget" do
    get api_v1_budget_url(@other_budget.id), headers: api_headers(@api_key)

    assert_response :not_found
    response_data = JSON.parse(response.body)
    assert_equal "record_not_found", response_data["error"]
  end

  test "returns not found for malformed budget id" do
    get api_v1_budget_url("not-a-uuid"), headers: api_headers(@api_key)

    assert_response :not_found
    response_data = JSON.parse(response.body)
    assert_equal "record_not_found", response_data["error"]
  end

  test "filters budgets by date range" do
    get api_v1_budgets_url,
        params: { start_date: @budget.start_date.to_s, end_date: @budget.end_date.to_s },
        headers: api_headers(@api_key)

    assert_response :success
    response_data = JSON.parse(response.body)
    assert_includes response_data["budgets"].map { |budget| budget["id"] }, @budget.id
  end

  test "rejects invalid date filters" do
    get api_v1_budgets_url, params: { start_date: "03/01/2024" }, headers: api_headers(@api_key)

    assert_response :unprocessable_entity
    response_data = JSON.parse(response.body)
    assert_equal "validation_failed", response_data["error"]
  end

  test "excludes another family member's personal budget" do
    @family.update!(personal_budgets: true)

    other_member_budget = @family.budgets.create!(
      user: users(:family_member),
      start_date: 5.months.ago.beginning_of_month.to_date,
      end_date: 5.months.ago.end_of_month.to_date,
      budgeted_spending: 800,
      currency: "USD"
    )

    get api_v1_budgets_url, headers: api_headers(@api_key)
    assert_response :success
    response_data = JSON.parse(response.body)
    assert_not_includes response_data["budgets"].map { |budget| budget["id"] }, other_member_budget.id

    get api_v1_budget_url(other_member_budget.id), headers: api_headers(@api_key)
    assert_response :not_found
  end

  test "includes another family member's personal budget once they share it" do
    @family.update!(personal_budgets: true)

    other_member_budget = @family.budgets.create!(
      user: users(:family_member),
      start_date: 5.months.ago.beginning_of_month.to_date,
      end_date: 5.months.ago.end_of_month.to_date,
      budgeted_spending: 800,
      currency: "USD"
    )
    BudgetShare.create!(owner: users(:family_member), viewer: @user, permission: "read_only")

    get api_v1_budgets_url, headers: api_headers(@api_key)
    assert_response :success
    response_data = JSON.parse(response.body)
    assert_includes response_data["budgets"].map { |budget| budget["id"] }, other_member_budget.id

    get api_v1_budget_url(other_member_budget.id), headers: api_headers(@api_key)
    assert_response :success
  end

  test "requires authentication" do
    get api_v1_budgets_url

    assert_response :unauthorized
  end

  test "requires read scope" do
    api_key_without_read = ApiKey.new(
      user: @user,
      name: "No Read Key",
      scopes: [],
      source: "mobile",
      display_key: "no_read_#{SecureRandom.hex(8)}"
    )
    api_key_without_read.save!(validate: false)

    get api_v1_budgets_url, headers: api_headers(api_key_without_read)

    assert_response :forbidden
  ensure
    api_key_without_read&.destroy
  end

  test "updates a budget's totals with a read-write key" do
    budget = Budget.find_or_bootstrap(@family, start_date: Date.current, user: nil)

    patch api_v1_budget_url(budget.id),
          params: { budget: { budgeted_spending: 3_400, expected_income: 6_000 } },
          headers: api_headers(budget_write_key)

    assert_response :success
    body = JSON.parse(response.body)
    assert_equal 340_000, body["budgeted_spending_cents"]
    assert_equal 600_000, body["expected_income_cents"]
    assert_equal 3_400, budget.reload.budgeted_spending
  end

  test "rejects a budget update with a read-only key" do
    budget = Budget.find_or_bootstrap(@family, start_date: Date.current, user: nil)

    patch api_v1_budget_url(budget.id), params: { budget: { budgeted_spending: 1 } }, headers: api_headers(@api_key)

    assert_response :forbidden
  end

  test "pace returns a cumulative daily series for the budget period" do
    budget = Budget.find_or_bootstrap(@family, start_date: Date.current, user: nil)
    budget.update!(budgeted_spending: 3_000)

    get pace_api_v1_budget_url(budget.id), headers: api_headers(budget_write_key)

    assert_response :success
    body = JSON.parse(response.body)
    assert_equal budget.start_date.iso8601, body["start_date"]
    assert_equal budget.end_date.iso8601, body["end_date"]
    assert_equal 300_000, body["budgeted_spending_cents"]
    assert_operator body["points"].size, :>=, 1

    point = body["points"].first
    assert_equal %w[actual_cumulative_cents date ideal_cumulative_cents].sort, point.keys.sort
    assert_equal body["points"].map { |p| p["date"] }.sort, body["points"].map { |p| p["date"] }
    assert body["points"].each_cons(2).all? { |a, b| b["actual_cumulative_cents"] >= a["actual_cumulative_cents"] }
    assert_equal 300_000, body["points"].last["ideal_cumulative_cents"] if body["points"].last["date"] == budget.end_date.iso8601
  end

  test "pace stops at today for the current period" do
    budget = Budget.find_or_bootstrap(@family, start_date: Date.current, user: nil)

    get pace_api_v1_budget_url(budget.id), headers: api_headers(budget_write_key)

    assert_response :success
    assert_equal [ Date.current, budget.end_date ].min.iso8601, JSON.parse(response.body)["points"].last["date"]
  end

  private

    def budget_write_key
      @budget_write_key ||= ApiKey.create!(
        user: @user,
        name: "Budget Write Key",
        scopes: [ "read_write" ],
        source: "mobile",
        display_key: "budget_rw_#{SecureRandom.hex(8)}"
      )
    end
end
