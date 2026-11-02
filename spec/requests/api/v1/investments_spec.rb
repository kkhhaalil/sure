# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'API V1 Investments', type: :request do
  let(:family) do
    Family.create!(name: 'API Family', currency: 'USD', locale: 'en', date_format: '%m-%d-%Y')
  end

  let(:user) do
    family.users.create!(email: 'api-user@example.com', password: 'password123', password_confirmation: 'password123')
  end

  let(:api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(user: user, name: 'API Docs Key', key: key, scopes: %w[read], source: 'web')
  end

  let(:'X-Api-Key') { api_key.plain_key }

  path '/api/v1/investments' do
    get 'Investments overview' do
      tags 'Investments'
      description 'The value of the caller\'s investment and crypto accounts over a period, each account\'s change, ' \
                  'allocation by asset class, and holdings rolled up by security. Amounts are minor units in the ' \
                  'family\'s currency.'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      parameter name: :period, in: :query, required: false,
                description: 'A Period key (default: last_30_days)',
                schema: { type: :string }

      response '200', 'overview returned' do
        schema '$ref' => '#/components/schemas/InvestmentsOverview'

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { nil }

        run_test!
      end

      response '422', 'unknown period' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:period) { 'forever' }

        run_test!
      end
    end
  end
end
