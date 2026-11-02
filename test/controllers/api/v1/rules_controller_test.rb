# frozen_string_literal: true

require "test_helper"

class Api::V1::RulesControllerTest < ActionDispatch::IntegrationTest
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

    Redis.new.del("api_rate_limit:#{@api_key.id}")

    @rule = @family.rules.build(
      name: "Coffee cleanup",
      resource_type: "transaction",
      active: true,
      effective_date: Date.new(2024, 1, 1)
    )
    @rule.conditions.build(condition_type: "transaction_name", operator: "like", value: "coffee")
    @rule.actions.build(action_type: "set_transaction_name", value: "Coffee")
    @rule.save!
  end

  test "should list rules" do
    get api_v1_rules_url, headers: api_headers(@api_key)
    assert_response :success

    json_response = JSON.parse(response.body)
    assert json_response["data"].any? { |rule| rule["id"] == @rule.id }
    assert_equal @family.rules.count, json_response["meta"]["total_count"]
  end

  test "should not list another family's rules" do
    other_family = Family.create!(name: "Other Family", currency: "USD", locale: "en")
    other_rule = other_family.rules.build(name: "Other", resource_type: "transaction", active: true)
    other_rule.conditions.build(condition_type: "transaction_name", operator: "like", value: "other")
    other_rule.actions.build(action_type: "set_transaction_name", value: "Other")
    other_rule.save!

    get api_v1_rules_url, headers: api_headers(@api_key)
    assert_response :success

    rule_ids = JSON.parse(response.body)["data"].map { |rule| rule["id"] }
    assert_includes rule_ids, @rule.id
    assert_not_includes rule_ids, other_rule.id
  end

  test "should require authentication when listing rules" do
    get api_v1_rules_url

    assert_response :unauthorized
  end

  test "should require read scope when listing rules" do
    api_key_without_read = api_key_without_read_scope

    get api_v1_rules_url, headers: api_headers(api_key_without_read)

    assert_response :forbidden
    json_response = JSON.parse(response.body)
    assert_equal "insufficient_scope", json_response["error"]
  ensure
    api_key_without_read&.destroy
  end

  test "should filter rules by active status" do
    inactive_rule = @family.rules.build(name: "Inactive", resource_type: "transaction", active: false)
    inactive_rule.conditions.build(condition_type: "transaction_name", operator: "like", value: "ignore")
    inactive_rule.actions.build(action_type: "set_transaction_name", value: "Ignore")
    inactive_rule.save!

    get api_v1_rules_url, params: { active: true }, headers: api_headers(@api_key)
    assert_response :success

    json_response = JSON.parse(response.body)
    rule_ids = json_response["data"].map { |rule| rule["id"] }
    assert_includes rule_ids, @rule.id
    assert_not_includes rule_ids, inactive_rule.id
  end

  test "should reject invalid active filter" do
    get api_v1_rules_url, params: { active: "not_boolean" }, headers: api_headers(@api_key)

    assert_response :unprocessable_entity
    json_response = JSON.parse(response.body)
    assert_equal "validation_failed", json_response["error"]
  end

  test "should reject unsupported resource type filter" do
    get api_v1_rules_url, params: { resource_type: "account" }, headers: api_headers(@api_key)

    assert_response :unprocessable_entity
    json_response = JSON.parse(response.body)
    assert_equal "validation_failed", json_response["error"]
  end

  test "should show rule with conditions and actions" do
    get api_v1_rule_url(@rule), headers: api_headers(@api_key)
    assert_response :success

    rule = JSON.parse(response.body)["data"]
    assert_equal @rule.id, rule["id"]
    assert_equal "Coffee cleanup", rule["name"]
    assert_equal "transaction", rule["resource_type"]
    assert_equal true, rule["active"]
    assert_equal "2024-01-01", rule["effective_date"]
    assert_equal @rule.reload.position, rule["position"]
    assert_equal false, rule["stop_processing"]

    assert_equal 1, rule["conditions"].length
    assert_equal "transaction_name", rule["conditions"].first["condition_type"]
    assert_equal "like", rule["conditions"].first["operator"]
    assert_equal "coffee", rule["conditions"].first["value"]

    assert_equal 1, rule["actions"].length
    assert_equal "set_transaction_name", rule["actions"].first["action_type"]
    assert_equal "Coffee", rule["actions"].first["value"]
  end

  test "should require authentication when showing a rule" do
    get api_v1_rule_url(@rule)

    assert_response :unauthorized
  end

  test "should require read scope when showing a rule" do
    api_key_without_read = api_key_without_read_scope

    get api_v1_rule_url(@rule), headers: api_headers(api_key_without_read)

    assert_response :forbidden
    json_response = JSON.parse(response.body)
    assert_equal "insufficient_scope", json_response["error"]
  ensure
    api_key_without_read&.destroy
  end

  test "should not show another family's rule" do
    other_family = Family.create!(name: "Other Family", currency: "USD", locale: "en")
    other_rule = other_family.rules.build(name: "Other", resource_type: "transaction", active: true)
    other_rule.conditions.build(condition_type: "transaction_name", operator: "like", value: "other")
    other_rule.actions.build(action_type: "set_transaction_name", value: "Other")
    other_rule.save!

    get api_v1_rule_url(other_rule), headers: api_headers(@api_key)
    assert_response :not_found
    json_response = JSON.parse(response.body)
    assert_equal "record_not_found", json_response["error"]
  end

  test "creates a rule with conditions and actions" do
    category = categories(:food_and_drink)

    assert_difference -> { @family.rules.count }, 1 do
      post api_v1_rules_url,
           params: {
             rule: {
               name: "Groceries",
               resource_type: "transaction",
               active: true,
               conditions_attributes: [ { condition_type: "transaction_name", operator: "like", value: "whole foods" } ],
               actions_attributes: [ { action_type: "set_transaction_category", value: category.id } ]
             }
           },
           headers: api_headers(write_key)
    end

    assert_response :created
    body = JSON.parse(response.body)["data"]
    assert_equal "Groceries", body["name"]
    assert_equal "set_transaction_category", body["actions"].first["action_type"]
  end

  test "rejects a rule without actions" do
    post api_v1_rules_url,
         params: { rule: { resource_type: "transaction", conditions_attributes: [ { condition_type: "transaction_name", operator: "like", value: "x" } ] } },
         headers: api_headers(write_key)

    assert_response :unprocessable_entity
  end

  test "rejects rule writes with a read-only key" do
    post api_v1_rules_url, params: { rule: { resource_type: "transaction" } }, headers: api_headers(@api_key)
    assert_response :forbidden
  end

  test "updates a rule" do
    patch api_v1_rule_url(@rule), params: { rule: { name: "Coffee shops", active: false } }, headers: api_headers(write_key)

    assert_response :success
    assert_equal "Coffee shops", @rule.reload.name
    assert_not @rule.active
  end

  test "destroys a rule" do
    assert_difference -> { @family.rules.count }, -1 do
      delete api_v1_rule_url(@rule), headers: api_headers(write_key)
    end
    assert_response :success
  end

  test "apply activates the rule and queues a run" do
    @rule.update!(active: false)

    assert_enqueued_with(job: RuleJob) do
      post apply_api_v1_rule_url(@rule), headers: api_headers(write_key)
    end

    assert_response :accepted
    assert @rule.reload.active
  end

  test "from_transaction builds a merchant rule that sets the category" do
    merchant = @family.merchants.create!(name: "Whole Foods")
    entry = @family.accounts.first.entries.create!(
      name: "WHOLEFDS #123", amount: 86.4, currency: "USD", date: Date.current,
      entryable: Transaction.new(merchant: merchant)
    )
    category = categories(:food_and_drink)

    post from_transaction_api_v1_rules_url,
         params: { transaction_id: entry.transaction.id, category_id: category.id },
         headers: api_headers(write_key)

    assert_response :created
    rule = @family.rules.order(:created_at).last
    assert_equal [ [ "transaction_merchant", "=", merchant.id ] ], rule.conditions.map { |c| [ c.condition_type, c.operator, c.value ] }
    assert_equal [ [ "set_transaction_category", category.id ] ], rule.actions.map { |a| [ a.action_type, a.value ] }
    assert rule.active
  end

  test "from_transaction falls back to the transaction name when there is no merchant" do
    entry = @family.accounts.first.entries.create!(
      name: "UBER *TRIP", amount: 23.1, currency: "USD", date: Date.current, entryable: Transaction.new
    )

    post from_transaction_api_v1_rules_url,
         params: { transaction_id: entry.transaction.id, category_id: categories(:food_and_drink).id },
         headers: api_headers(write_key)

    assert_response :created
    condition = @family.rules.order(:created_at).last.conditions.first
    assert_equal [ "transaction_name", "like", "UBER *TRIP" ], [ condition.condition_type, condition.operator, condition.value ]
  end

  test "from_transaction rejects a category from another family" do
    other_category = families(:empty).categories.create!(name: "Theirs", color: "#111111")

    post from_transaction_api_v1_rules_url,
         params: { transaction_id: @family.transactions.first.id, category_id: other_category.id },
         headers: api_headers(write_key)

    assert_response :not_found
  end

  test "preview counts and samples the transactions an unsaved rule would match" do
    account = @family.accounts.first
    3.times do |i|
      account.entries.create!(name: "DELTA AIR #{i}", amount: 38 + i, currency: "USD", date: Date.current - i, entryable: Transaction.new)
    end
    account.entries.create!(name: "UNITED", amount: 50, currency: "USD", date: Date.current, entryable: Transaction.new)

    assert_no_difference "@family.rules.count" do
      post preview_api_v1_rules_url,
           params: { rule: { resource_type: "transaction", conditions_attributes: [ { condition_type: "transaction_name", operator: "like", value: "delta air" } ] } },
           headers: api_headers(@api_key)
    end

    assert_response :success
    data = JSON.parse(response.body)["data"]
    assert_equal 3, data["count"]
    assert_equal [ "DELTA AIR 0", "DELTA AIR 1", "DELTA AIR 2" ], data["transactions"].map { |t| t["name"] }
    assert_equal 3800, data["transactions"].first["amount_cents"]
  end

  test "preview narrows by amount" do
    account = @family.accounts.first
    account.entries.create!(name: "DELTA AIR", amount: 38, currency: "USD", date: Date.current, entryable: Transaction.new)
    account.entries.create!(name: "DELTA AIR", amount: 412, currency: "USD", date: Date.current, entryable: Transaction.new)

    post preview_api_v1_rules_url,
         params: { rule: { resource_type: "transaction", conditions_attributes: [
           { condition_type: "transaction_name", operator: "like", value: "delta air" },
           { condition_type: "transaction_amount", operator: "=", value: "38" }
         ] } },
         headers: api_headers(@api_key)

    assert_response :success
    assert_equal 1, JSON.parse(response.body)["data"]["count"]
  end

  test "preview rejects an unsupported resource type" do
    post preview_api_v1_rules_url,
         params: { rule: { resource_type: "account", conditions_attributes: [] } },
         headers: api_headers(@api_key)

    assert_response :unprocessable_entity
  end

  private

    def write_key
      @write_key ||= ApiKey.create!(
        user: @user,
        name: "Rules Write Key",
        scopes: [ "read_write" ],
        source: "mobile",
        display_key: "rules_rw_#{SecureRandom.hex(8)}"
      )
    end

    def api_key_without_read_scope
      # Valid persisted API keys can only be read/read_write; this intentionally
      # bypasses validations to exercise the runtime insufficient-scope guard.
      ApiKey.new(
        user: @user,
        name: "No Read Key",
        scopes: [],
        display_key: "test_no_read_#{SecureRandom.hex(8)}",
        source: "mobile"
      ).tap { |api_key| api_key.save!(validate: false) }
    end

    def api_headers(api_key)
      { "X-Api-Key" => api_key.plain_key }
    end
end
