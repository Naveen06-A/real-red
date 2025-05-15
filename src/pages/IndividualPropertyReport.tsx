import React from 'react';
import { Property } from '../types/Property';
import { PredictionResult } from './AgentDashboard';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { formatCurrency } from '../utils/formatters';

interface IndividualPropertyReportProps {
  property: Property;
  prediction: PredictionResult;
  onUpdate: (updatedProperty: Property) => void;
}

export function IndividualPropertyReport({ property, prediction }: IndividualPropertyReportProps) {
  const chartData = prediction.historicalData.dates.map((date, index) => ({
    date,
    price: prediction.historicalData.prices[index],
  }));

  return (
    <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Property Analysis Report</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-gray-600">
            <strong>Recommendation:</strong>{' '}
            <span className={prediction.recommendation === 'BUY' ? 'text-green-600' : 'text-red-600'}>
              {prediction.recommendation}
            </span>
          </p>
          <p className="text-gray-600">
            <strong>Confidence:</strong> {prediction.confidence.toFixed(2)}%
          </p>
          <p className="text-gray-600">
            <strong>Market Trend:</strong>{' '}
            <span className="flex items-center">
              {prediction.trend >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-600 mr-1" />
              )}
              {prediction.trend.toFixed(2)}%
            </span>
          </p>
          <p className="text-gray-600">
            <strong>Market Condition:</strong> {prediction.marketCondition || 'N/A'}
          </p>
          <p className="text-gray-600">
            <strong>Sentiment Score:</strong> {prediction.sentimentScore?.toFixed(2) || 'N/A'}
          </p>
        </div>
        <div>
          <p className="text-gray-600">
            <strong>Address:</strong>{' '}
            {property.street_number && property.street_name
              ? `${property.street_number} ${property.street_name}`
              : property.address || 'N/A'}
          </p>
          <p className="text-gray-600">
            <strong>Suburb:</strong> {property.suburb || 'N/A'}
          </p>
          <p className="text-gray-600">
            <strong>Price:</strong>{' '}
            {property.price ? formatCurrency(property.price) : 'N/A'}
          </p>
          <p className="text-gray-600">
            <strong>Type:</strong> {property.property_type || 'N/A'}
          </p>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="mt-4">
          <h4 className="text-md font-semibold text-gray-800 mb-2">Price Trend (Last 12 Months)</h4>
          <LineChart
            width={500}
            height={200}
            data={chartData}
            className="w-full max-w-full"
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
            <Legend />
            <Line type="monotone" dataKey="price" stroke="#2563eb" activeDot={{ r: 8 }} />
          </LineChart>
        </div>
      )}
    </div>
  );
}