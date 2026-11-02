require "test_helper"

class IntradayPriceRefreshJobTest < ActiveJob::TestCase
  test "refreshes the account it was enqueued for" do
    account = accounts(:investment)
    service = stub(call: nil)
    InvestmentPriceRefresh.expects(:new).with(account: account).returns(service)

    IntradayPriceRefreshJob.perform_now(account_id: account.id)
  end

  test "refreshes every manual investment account when no account is given" do
    service = stub(call: nil)
    InvestmentPriceRefresh.expects(:new).with(account: nil).returns(service)

    IntradayPriceRefreshJob.perform_now
  end

  test "does nothing when the account no longer exists" do
    InvestmentPriceRefresh.expects(:new).never

    IntradayPriceRefreshJob.perform_now(account_id: SecureRandom.uuid)
  end
end
