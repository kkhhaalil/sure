# frozen_string_literal: true

# Returns the family's balance sheet data (net worth, assets, liabilities)
# with all monetary values converted to the family's primary currency.
class Api::V1::BalanceSheetController < Api::V1::BaseController
  before_action :ensure_read_scope

  # GET /api/v1/balance_sheet
  # Returns net worth, total assets, and total liabilities as Money objects.
  def show
    family = current_resource_owner.family
    balance_sheet = family.balance_sheet

    render json: {
      currency: family.currency,
      net_worth: balance_sheet.net_worth_money.as_json,
      assets: balance_sheet.assets.total_money.as_json,
      liabilities: balance_sheet.liabilities.total_money.as_json
    }
  end

  # GET /api/v1/balance_sheet/series?period=last_90_days
  # Daily net worth over a Period key, in the family's currency, scoped to
  # the accounts the caller can see.
  def series
    period_key = params[:period].presence || "last_30_days"
    unless Period.valid_key?(period_key)
      render json: { error: "validation_failed", message: "period must be one of: #{Period::PERIODS.keys.join(", ")}" },
             status: :unprocessable_entity
      return
    end

    family = current_resource_owner.family
    series = family.balance_sheet(user: current_resource_owner).net_worth_series(period: Period.from_key(period_key))
    conversion = Money::Currency.new(family.currency).minor_unit_conversion

    render json: {
      currency: family.currency,
      period: period_key,
      points: series.values.map do |point|
        amount = point.value.amount
        { date: point.date.iso8601, net_worth: amount.to_d.to_s("F"), net_worth_cents: (amount * conversion).round(0).to_i }
      end
    }
  end

  private

    def ensure_read_scope
      authorize_scope!(:read)
    end
end
