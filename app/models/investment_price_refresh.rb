# Re-quotes the holdings of manually tracked investment accounts and revalues
# those accounts in place.
#
# Two separate gaps make this necessary rather than a duplicate of the nightly
# market data import:
#
#   * Security::Price::Importer skips a date that already has a price, so a
#     second import on the same day is a no-op unless clear_cache is set — the
#     stored quote would stay at whatever was fetched first that morning.
#   * The daily import only writes prices. Account totals are recomputed by a
#     sync (Balance::Materializer), so a fresh price alone changes nothing on
#     screen.
#
# Together they leave a manual investment account showing yesterday's value for
# the whole trading day. This refreshes today's quote and materializes the
# balances, so the account follows the market (and a UI refresh does too).
class InvestmentPriceRefresh
  Result = Data.define(:accounts, :securities, :errors)

  INVESTMENT_TYPES = %w[Investment Crypto].freeze

  def initialize(account: nil, date: Date.current)
    @account = account
    @date = date
  end

  def call
    accounts = target_accounts
    securities = held_securities(accounts)
    errors = []

    securities.each do |security|
      _, error = security.import_provider_prices(start_date: @date, end_date: @date, clear_cache: true)
      errors << [ security.ticker, error.to_s ] if error.present?
    end

    accounts.each do |account|
      Balance::Materializer.new(account, strategy: :forward).materialize_balances
    end

    Result.new(accounts: accounts, securities: securities, errors: errors)
  end

  private
    # Only accounts that hold securities and have no provider: a linked account
    # gets its quotes and balances from the provider, and re-quoting it here
    # would spend API credits on a number that is about to be overwritten.
    def target_accounts
      scope = Account.where(accountable_type: INVESTMENT_TYPES).joins(:holdings).distinct.manual
      scope = scope.where(id: @account.id) if @account

      scope.to_a
    end

    def held_securities(accounts)
      return [] if accounts.empty?

      Security.online
        .where(id: Holding.where(account_id: accounts.map(&:id)).select(:security_id))
        .to_a
    end
end
