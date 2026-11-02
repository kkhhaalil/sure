require "test_helper"

class InvestmentPriceRefreshTest < ActiveSupport::TestCase
  setup do
    @account = accounts(:investment)
    @security = securities(:aapl)
  end

  test "re-quotes today's price for a manual investment account and revalues it" do
    Security.any_instance.expects(:import_provider_prices)
            .with(start_date: Date.current, end_date: Date.current, clear_cache: true)
            .returns([ 1, nil ])
    Balance::Materializer.any_instance.expects(:materialize_balances).once

    result = InvestmentPriceRefresh.new.call

    assert_equal [ @account ], result.accounts
    assert_equal [ @security.ticker ], result.securities.map(&:ticker)
    assert_empty result.errors
  end

  test "leaves accounts that sync from a provider alone" do
    AccountProvider.create!(account: @account, provider: plaid_accounts(:one))

    assert_empty InvestmentPriceRefresh.new.call.accounts
  end

  test "collects provider errors instead of raising" do
    Security.any_instance.stubs(:import_provider_prices).returns([ 0, "rate limit exceeded" ])
    Balance::Materializer.any_instance.stubs(:materialize_balances)

    result = InvestmentPriceRefresh.new.call

    assert_equal [ [ @security.ticker, "rate limit exceeded" ] ], result.errors
  end
end
