# frozen_string_literal: true

class Api::V1::BudgetsController < Api::V1::BaseController
  include Pagy::Backend

  before_action :ensure_read_scope, only: %i[index show pace]
  before_action :ensure_write_scope, only: :update
  before_action :set_budget, only: %i[show update pace]
  before_action :ensure_budget_editable, only: :update

  def index
    budgets_query = apply_filters(budgets_scope).order(start_date: :desc)
    @per_page = safe_per_page_param

    @pagy, @budgets = pagy(
      budgets_query,
      page: safe_page_param,
      limit: @per_page
    )

    render :index
  end

  def show
    render :show
  end

  def update
    if @budget.update(budget_params)
      render :show
    else
      render json: { error: "validation_failed", message: "Budget could not be updated", errors: @budget.errors.full_messages },
             status: :unprocessable_entity
    end
  end

  def pace
    @budget.current_user = current_resource_owner
    @points = @budget.pace_series
    render :pace
  end

  private
    def budget_params
      params.require(:budget).permit(:budgeted_spending, :expected_income)
    end

    def ensure_write_scope
      authorize_scope!(:write)
    end

    # Personal budgets shared read-only stay read-only here too.
    def ensure_budget_editable
      raise ActiveRecord::RecordNotFound unless @budget.editable_by?(current_resource_owner)
    end

    def set_budget
      raise ActiveRecord::RecordNotFound unless valid_uuid?(params[:id])

      @budget = budgets_scope.find(params[:id])
    end

    def ensure_read_scope
      authorize_scope!(:read)
    end

    def apply_filters(query)
      query = query.where("budgets.start_date >= ?", parse_date_param(:start_date)) if params[:start_date].present?
      query = query.where("budgets.end_date <= ?", parse_date_param(:end_date)) if params[:end_date].present?
      query
    end

    def budgets_scope
      current_resource_owner.family.budgets
        .where(user_id: visible_owner_ids)
        .includes(budget_categories: :category)
    end

    # nil (the shared household budget) + the caller's own personal budget +
    # any owner who granted the caller a BudgetShare (read-only or
    # read-write; writes check editable_by? separately).
    def visible_owner_ids
      shared_with_me = BudgetShare.where(viewer_id: current_resource_owner.id).pluck(:owner_id)
      [ nil, current_resource_owner.id, *shared_with_me ]
    end
end
