class Api::V1::CashFlowsController < Api::V1::BaseController
  before_action -> { authorize_scope!(:read) }

  def show
    response.headers["Cache-Control"] = "private, no-store"
    today = Date.current
    statement = IncomeStatement.new(current_resource_owner.family, user: current_resource_owner)
    if params[:include] && params[:view]
      return invalid_query("invalid_view", "include and view cannot be combined")
    end
    unless [ nil, "sankey" ].include?(params[:include]) && [ nil, "sankey" ].include?(params[:view])
      return invalid_query("invalid_view", "include and view support only sankey")
    end
    if params[:group_by] && params[:view] != "sankey"
      return invalid_query("invalid_group_by", "group_by requires view=sankey")
    end
    group_by = params[:group_by] || "category"
    unless IncomeStatement::CashFlowGraph::GROUPINGS.key?(group_by)
      return invalid_query("invalid_group_by", "group_by must be category or account")
    end
    if params[:start_date] || params[:end_date]
      start_date, end_date = parse_date(params[:start_date]), parse_date(params[:end_date])
      unless params[:view] == "sankey" && params[:month].nil? && start_date && end_date && start_date <= end_date
        return invalid_query("invalid_period", "Date ranges require view=sankey, both ISO dates in order, and no month")
      end
      period = Period.custom(start_date: start_date, end_date: end_date)
    else
      month = params[:month].nil? ? today.beginning_of_month : parse_date(params[:month])
      unless month && month.day == 1 && month <= today
        return invalid_query("invalid_month", "month must be a non-future ISO first day (YYYY-MM-01)")
      end
      period = Period.custom(start_date: month, end_date: [ month.end_of_month, today ].min)
    end

    if params[:view] == "sankey"
      # Arbitrary graph ranges must not allocate a daily comparison series.
      render json: IncomeStatement::CashFlowGraph.new(statement, period: period, group_by: group_by, as_of: today)
    else
      render json: IncomeStatement::CashFlow.new(statement, month: month, as_of: today, include_sankey: params[:include] == "sankey")
    end
  end


  # GET /api/v1/cash_flow/series?months=12[&category_id=]
  # Income and spending per calendar month, oldest first, ending with the
  # current (partial) month. With category_id, spending covers that category
  # and its subcategories only.
  def series
    months = Integer(params.fetch(:months, 12), exception: false)
    unless months&.between?(1, 24)
      return invalid_query("invalid_months", "months must be between 1 and 24")
    end

    category_ids = nil
    if params[:category_id].present?
      category = current_resource_owner.family.categories.find(params[:category_id])
      category_ids = [ category.id ]
    end

    statement = current_resource_owner.family.income_statement(user: current_resource_owner)
    today = Time.zone.today
    first_month = today.beginning_of_month << (months - 1)

    rows = (0...months).map do |offset|
      month = first_month >> offset
      period = Period.custom(start_date: month, end_date: [ month.end_of_month, today ].min)
      totals = statement.totals_for(period)
      spending = if category_ids
        statement.daily_expense_series(period: period, category_ids: category_ids).sum { |day| day.total.to_d }
      else
        totals.expense_money.amount
      end

      { month: month.iso8601, income: totals.income_money.amount.to_d.to_s("F"), spending: spending.to_d.to_s("F") }
    end

    response.headers["Cache-Control"] = "private, no-store"
    render json: { currency: current_resource_owner.family.currency, category_id: category_ids&.first, months: rows }
  end

  private
    def invalid_query(error, message)
      render json: { error: error, message: message }, status: :unprocessable_entity
    end
end
