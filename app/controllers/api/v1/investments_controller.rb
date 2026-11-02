# frozen_string_literal: true

# GET /api/v1/investments?period=last_30_days
# Everything an investments overview needs in one read: the value of the
# caller's investment and crypto accounts over the period, each account's
# change, allocation, and holdings rolled up by security.
class Api::V1::InvestmentsController < Api::V1::BaseController
  before_action :ensure_read_scope

  def show
    period_key = params[:period].presence || "last_30_days"
    unless Period.valid_key?(period_key)
      return render_validation_error("period must be one of: #{Period::PERIODS.keys.join(", ")}")
    end

    render json: InvestmentStatement::Overview.new(
      family: current_resource_owner.family,
      user: current_resource_owner,
      period: Period.from_key(period_key)
    ).as_json.merge(period: period_key)
  end

  private

    def ensure_read_scope
      authorize_scope!(:read)
    end
end
