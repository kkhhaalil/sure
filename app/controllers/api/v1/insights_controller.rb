# frozen_string_literal: true

class Api::V1::InsightsController < Api::V1::BaseController
  before_action :ensure_read_scope, only: :index
  before_action :ensure_write_scope, only: :update
  before_action :require_preview_features_for_api

  def index
    insights = current_resource_owner.family.insights.visible.ordered

    render json: {
      insights: insights.map { |insight| serialize(insight) }
    }
  end

  # Lets a client mark an insight read when it is shown, or dismiss it so
  # it stops being listed. Expiry stays a server-side decision.
  def update
    insight = current_resource_owner.family.insights.find(params[:id])

    case params[:status]
    when "read"
      insight.update!(status: "read", read_at: insight.read_at || Time.current)
    when "dismissed"
      insight.update!(status: "dismissed", dismissed_at: Time.current)
    else
      render_json({ error: "validation_failed", message: "status must be read or dismissed" }, status: :unprocessable_entity)
      return
    end

    render json: serialize(insight)
  end

  private
    def ensure_write_scope
      authorize_scope!(:write)
    end

    def ensure_read_scope
      authorize_scope!(:read)
    end

    def require_preview_features_for_api
      return if current_resource_owner.preview_features_enabled?

      render_json(
        { error: "feature_disabled", message: "Preview features are not enabled for this user" },
        status: :forbidden
      )
    end

    def serialize(insight)
      {
        id: insight.id,
        type: insight.insight_type,
        title: insight.title,
        body: insight.body,
        priority: insight.priority,
        status: insight.status,
        generated_at: insight.generated_at&.iso8601,
        period_start: insight.period_start&.iso8601,
        period_end: insight.period_end&.iso8601,
        facts: insight.facts
      }
    end
end
