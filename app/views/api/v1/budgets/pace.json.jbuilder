# frozen_string_literal: true

minor_units = ->(amount) { (amount.to_d * Money::Currency.new(@budget.currency).minor_unit_conversion).round(0).to_i }

json.budget_id @budget.id
json.start_date @budget.start_date
json.end_date @budget.end_date
json.currency @budget.currency
json.budgeted_spending_cents minor_units.call(@budget.budgeted_spending || 0)

json.points @points do |point|
  json.date point.date
  json.actual_cumulative_cents minor_units.call(point.actual_cumulative)
  json.ideal_cumulative_cents minor_units.call(point.ideal_cumulative)
end
