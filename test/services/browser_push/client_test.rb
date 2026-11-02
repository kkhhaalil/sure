require "test_helper"

class BrowserPush::ClientTest < ActiveSupport::TestCase
  setup do
    @subscription = users(:family_admin).push_subscriptions.create!(
      token: Digest::SHA256.hexdigest("https://web.push.apple.com/client-test"),
      endpoint: "https://web.push.apple.com/client-test", p256dh: "BKey", auth_secret: "auth",
      environment: "production", platform: "web", last_registered_at: 1.minute.ago
    )
  end

  test "is available once VAPID keys are configured, in any app mode" do
    with_env_overrides(WEB_PUSH_VAPID_PUBLIC_KEY: "pub", WEB_PUSH_VAPID_PRIVATE_KEY: "priv") do
      assert BrowserPush::Client.available?
    end
    with_env_overrides(WEB_PUSH_VAPID_PUBLIC_KEY: nil, WEB_PUSH_VAPID_PRIVATE_KEY: nil) do
      assert_not BrowserPush::Client.available?
    end
  end

  test "sends the notification to the subscription's endpoint with its keys" do
    with_env_overrides(WEB_PUSH_VAPID_PUBLIC_KEY: "pub", WEB_PUSH_VAPID_PRIVATE_KEY: "priv", WEB_PUSH_VAPID_SUBJECT: "mailto:a@b.c") do
      WebPush.expects(:payload_send).with do |args|
        payload = JSON.parse(args[:message])
        args[:endpoint] == @subscription.endpoint &&
          args[:p256dh] == "BKey" && args[:auth] == "auth" &&
          args[:vapid] == { subject: "mailto:a@b.c", public_key: "pub", private_key: "priv" } &&
          payload["title"] == "Heads up" && payload["url"] == "/m/assistant"
      end.returns(stub(code: "201"))

      response = BrowserPush::Client.new(@subscription).deliver(token: @subscription.token, title: "Heads up", body: "Dining is high", insight_id: "abc")
      assert response.ok?
    end
  end

  test "maps an expired subscription to a 410 response" do
    with_env_overrides(WEB_PUSH_VAPID_PUBLIC_KEY: "pub", WEB_PUSH_VAPID_PRIVATE_KEY: "priv") do
      WebPush.stubs(:payload_send).raises(WebPush::ExpiredSubscription.new(stub(body: "", code: "410"), "web.push.apple.com"))

      response = BrowserPush::Client.new(@subscription).deliver(token: @subscription.token, title: "t", body: "b", insight_id: "abc")
      assert_not response.ok?
      assert_equal 410, response.status
    end
  end

  test "delivery removes a web subscription the push service reports gone" do
    with_env_overrides(WEB_PUSH_VAPID_PUBLIC_KEY: "pub", WEB_PUSH_VAPID_PRIVATE_KEY: "priv") do
      WebPush.stubs(:payload_send).raises(WebPush::ExpiredSubscription.new(stub(body: "", code: "410"), "web.push.apple.com"))

      assert_difference "PushSubscription.count", -1 do
        result = PushSubscription::Delivery.new(@subscription).call do |client|
          client.deliver(token: @subscription.token, title: "t", body: "b", insight_id: "abc")
        end
        assert_equal :unregistered, result
      end
    end
  end
end
