# Revalues manually tracked investment accounts against today's quotes.
#
# Scheduled every two hours during US market hours (see config/schedule.yml) and
# enqueued when someone hits refresh on an investment account, so the account
# value follows the market instead of waiting for the nightly sync.
class IntradayPriceRefreshJob < ApplicationJob
  queue_as :scheduled

  def perform(account_id: nil)
    account = account_id.present? ? Account.find_by(id: account_id) : nil

    # A deleted account between enqueue and run is not an error worth retrying.
    return if account_id.present? && account.nil?

    InvestmentPriceRefresh.new(account: account).call
  end
end
