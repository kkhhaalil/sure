# The investments overview a client shows on one screen: the portfolio's
# value over a period, each account's change, allocation, and holdings with
# their latest move and a short value history. Amounts are integer minor
# units in the family's currency.
class InvestmentStatement::Overview
  SPARK_DAYS = 30

  attr_reader :statement, :period

  def initialize(family:, user:, period:)
    @statement = InvestmentStatement.new(family, user: user)
    @period = period
  end

  def as_json(*)
    series = series_for(account_ids)
    first, last = series.values.first&.value, series.values.last&.value

    {
      currency: currency,
      total_cents: cents(statement.portfolio_value),
      change_cents: first && last ? cents(last.amount - first.amount) : 0,
      change_percent: percent(first&.amount, last&.amount),
      series: series.values.map { |v| { date: v.date.iso8601, value_cents: cents(v.value.amount) } },
      accounts: accounts_json,
      allocation: allocation_json,
      holdings: holdings_json
    }
  end

  private
    def currency
      statement.family.currency
    end

    def accounts
      @accounts ||= statement.investment_accounts.to_a
    end

    def account_ids
      accounts.map(&:id)
    end

    def series_for(ids)
      Balance::ChartSeriesBuilder.new(account_ids: ids, currency: currency, period: period, favorable_direction: "up").balance_series
    end

    def accounts_json
      accounts.map do |account|
        values = series_for([ account.id ]).values
        first, last = values.first&.value&.amount, values.last&.value&.amount
        {
          id: account.id,
          name: account.name,
          account_type: account.accountable_type.underscore,
          subtype: account.subtype,
          institution_name: account.institution_name,
          balance_cents: cents(statement.to_family_currency(account.balance, account.currency)),
          change_cents: first && last ? cents(last - first) : 0,
          change_percent: percent(first, last)
        }
      end.sort_by { |a| -a[:balance_cents] }
    end

    # By asset class where securities have one; otherwise holdings count as
    # "securities". Investment cash is "cash", crypto account balances without
    # holdings are "crypto", and whatever a balance holds beyond its known
    # holdings and cash is "other".
    def allocation_json
      buckets = Hash.new(0)

      statement.holdings_by_security.each do |security, value, _|
        buckets[security.asset_class.presence || "securities"] += value
      end

      held = statement.current_holdings.group_by(&:account_id)
      accounts.each do |account|
        balance = statement.to_family_currency(account.balance, account.currency)
        holdings = (held[account.id] || []).sum { |h| statement.to_family_currency(h.amount, h.currency) }
        cash = account.accountable_type == "Investment" ? statement.to_family_currency(account.cash_balance || 0, account.currency) : 0
        rest = balance - holdings - cash

        buckets["cash"] += cash
        buckets[account.accountable_type == "Crypto" && holdings.zero? ? "crypto" : "other"] += rest
      end

      positive = buckets.select { |_, v| v.positive? }
      total = positive.values.sum
      return [] if total.zero?

      positive
        .sort_by { |_, v| -v }
        .map { |key, value| { key: key, label: key.humanize, value_cents: cents(value), percent: (value / total * 100).round(2).to_s } }
    end

    def holdings_json
      history = spark_history

      statement.holdings_by_security.map do |security, value, holdings|
        qty = holdings.sum(&:qty)
        previous = holdings.sum { |h| h.day_change ? statement.to_family_currency(h.day_change.previous, h.currency) : statement.to_family_currency(h.amount, h.currency) }
        {
          security: { id: security.id, ticker: security.ticker, name: security.name.presence || security.ticker, logo_url: security.logo_url },
          qty: qty.to_s,
          value_cents: cents(value),
          price_cents: qty.zero? ? 0 : cents(value / qty),
          day_change_percent: percent(previous, value),
          spark: history[security.id] || []
        }
      end
    end

    # Each security's summed position value per day over the last SPARK_DAYS.
    def spark_history
      rows = Holding
        .where(account_id: account_ids, date: (Date.current - SPARK_DAYS)..Date.current)
        .order(:date)
        .pluck(:security_id, :date, :amount, :currency)

      rows.group_by(&:first).transform_values do |list|
        list.group_by { |_, date, _, _| date }.map do |_, day|
          cents(day.sum { |_, _, amount, curr| statement.to_family_currency(amount, curr) })
        end
      end
    end

    def cents(amount)
      (amount.to_d * Money::Currency.new(currency).minor_unit_conversion).round(0).to_i
    end

    def percent(from, to)
      return nil if from.nil? || to.nil? || from.zero?
      ((to - from) / from.abs * 100).round(2).to_s
    end
end
