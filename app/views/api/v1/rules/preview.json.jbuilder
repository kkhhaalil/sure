# frozen_string_literal: true

json.data do
  json.count @count
  json.transactions @transactions do |transaction|
    entry = transaction.entry
    money = entry.amount_money
    json.id transaction.id
    json.name entry.name
    json.merchant_name transaction.merchant&.name
    json.date entry.date
    json.amount_cents (money.amount * money.currency.minor_unit_conversion).round(0).to_i.abs
    json.currency entry.currency
    json.classification entry.classification
    json.account_name entry.account.name
    if transaction.category
      json.category { json.extract! transaction.category, :id, :name, :color }
    else
      json.category nil
    end
  end
end
