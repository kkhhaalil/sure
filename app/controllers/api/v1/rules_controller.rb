# frozen_string_literal: true

class Api::V1::RulesController < Api::V1::BaseController
  include Pagy::Backend

  BOOLEAN_FILTERS = {
    "true" => true,
    "1" => true,
    "false" => false,
    "0" => false
  }.freeze
  RESOURCE_TYPES = %w[transaction].freeze

  before_action :ensure_read_scope, only: %i[index show]
  before_action :ensure_write_scope, only: %i[create update destroy apply from_transaction]
  before_action :set_rule, only: %i[show update destroy apply]

  def index
    return render_invalid_resource_type_filter if invalid_resource_type_filter?

    @per_page = safe_per_page_param
    rules_query = current_resource_owner.family.rules
      .includes(:actions, conditions: :sub_conditions)
      .order(:created_at, :id)

    rules_query = rules_query.where(resource_type: params[:resource_type]) if params[:resource_type].present?
    if params[:active].present?
      active = parse_boolean_filter(params[:active])
      return if performed?

      rules_query = rules_query.where(active: active)
    end

    @pagy, @rules = pagy(
      rules_query,
      page: safe_page_param,
      limit: @per_page
    )

    render :index
  end

  def show
    render :show
  end

  def create
    @rule = current_resource_owner.family.rules.build(rule_params)
    save_rule(status: :created)
  end

  def update
    @rule.assign_attributes(rule_params)
    save_rule(status: :ok)
  end

  def destroy
    @rule.destroy!
    render json: { message: "Rule deleted successfully" }, status: :ok
  end

  # Activates the rule and runs it over existing matches in the background,
  # the API counterpart of the web "Apply" button.
  def apply
    @rule.update!(active: true)
    @rule.apply_later(ignore_attribute_locks: true)
    render :show, status: :accepted
  end

  # "Always categorize this merchant this way" from a single transaction:
  # matches on the transaction's merchant when it has one, otherwise on its
  # name, sets the category, and runs over existing matches.
  def from_transaction
    family = current_resource_owner.family
    transaction = family.transactions.find(params.require(:transaction_id))
    category = family.categories.find(params.require(:category_id))

    @rule = family.rules.build(resource_type: "transaction", active: true)
    if transaction.merchant_id.present?
      @rule.conditions.build(condition_type: "transaction_merchant", operator: "=", value: transaction.merchant_id)
    else
      @rule.conditions.build(condition_type: "transaction_name", operator: "like", value: transaction.entry.name)
    end
    @rule.actions.build(action_type: "set_transaction_category", value: category.id)

    if @rule.save
      @rule.apply_later
      render :show, status: :created
    else
      render_validation_error(@rule.errors.full_messages.to_sentence)
    end
  end

  private
    def save_rule(status:)
      if @rule.save
        render :show, status: status
      else
        render_validation_error(@rule.errors.full_messages.to_sentence)
      end
    end

    def rule_params
      params.require(:rule).permit(
        :resource_type, :effective_date, :active, :name, :stop_processing,
        conditions_attributes: [
          :id, :condition_type, :operator, :value, :_destroy,
          sub_conditions_attributes: [ :id, :condition_type, :operator, :value, :_destroy ]
        ],
        actions_attributes: [ :id, :action_type, :value, :_destroy ]
      )
    end

    def ensure_write_scope
      authorize_scope!(:write)
    end

    def set_rule
      @rule = current_resource_owner.family.rules
        .includes(:actions, conditions: :sub_conditions)
        .find(params[:id])
    end

    def ensure_read_scope
      authorize_scope!(:read)
    end

    def parse_boolean_filter(value)
      normalized = value.to_s.downcase
      return BOOLEAN_FILTERS[normalized] if BOOLEAN_FILTERS.key?(normalized)

      render_validation_error("active must be one of: true, false, 1, 0")
      nil
    end

    def invalid_resource_type_filter?
      params[:resource_type].present? && !params[:resource_type].in?(RESOURCE_TYPES)
    end

    def render_invalid_resource_type_filter
      render_validation_error("resource_type must be one of: #{RESOURCE_TYPES.join(", ")}")
    end
end
