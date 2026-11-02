# frozen_string_literal: true

class AddWebPushToPushSubscriptions < ActiveRecord::Migration[8.1]
  def change
    add_column :push_subscriptions, :endpoint, :text
    add_column :push_subscriptions, :p256dh, :string
    add_column :push_subscriptions, :auth_secret, :string

    remove_check_constraint :push_subscriptions, "platform::text = 'ios'::text", name: "chk_push_subscriptions_platform"
    add_check_constraint :push_subscriptions, "platform::text = ANY (ARRAY['ios'::text, 'web'::text])", name: "chk_push_subscriptions_platform"
  end
end
