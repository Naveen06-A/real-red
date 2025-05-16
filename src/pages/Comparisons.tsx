import { ChartOptions } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { PropertyMetrics, TopLister, CommissionEarner, Agent, Agency } from './Reports';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);

const OUR_AGENCY = 'Harcourt Success';

interface ComparisonsProps {
  propertyMetrics: PropertyMetrics | null;
  isLoading?: boolean;
}

export function Comparisons({ propertyMetrics, isLoading }: ComparisonsProps) {
  console.log('Comparisons rendered with propertyMetrics:', propertyMetrics);

  if (isLoading) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-lg text-center">
        <p className="text-gray-500">Loading comparison data...</p>
      </div>
    );
  }

  if (!propertyMetrics) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-lg text-center">
        <p className="text-gray-500">No comparison data available</p>
      </div>
    );
  }

  const renderTopListersComparison = () => {
    if (!propertyMetrics.topListersBySuburb || !propertyMetrics.ourListingsBySuburb) {
      return <p className="text-gray-500">Top listers data unavailable</p>;
    }
    return (
      <motion.div
        className="bg-white p-6 rounded-xl shadow-lg mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <svg className="w-6 h-6 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          Top Listers by Suburb
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-blue-600 text-white">
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  Suburb
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  Top Lister
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  Listings
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  {OUR_AGENCY} Listings
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(propertyMetrics.topListersBySuburb).map(([suburb, data]: [string, TopLister]) => (
                <tr key={suburb} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">{suburb}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{data.agent}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{data.count}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{propertyMetrics.ourListingsBySuburb[suburb] || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    );
  };

  const renderCommissionComparison = () => {
    if (!propertyMetrics.topCommissionEarners || propertyMetrics.ourCommission === undefined) {
      return <p className="text-gray-500">Commission data unavailable</p>;
    }
    const commissionData = useMemo(
      () => ({
        labels: [...propertyMetrics.topCommissionEarners.map((e: CommissionEarner) => e.agent), OUR_AGENCY],
        datasets: [
          {
            label: 'Commission Earned',
            data: [
              ...propertyMetrics.topCommissionEarners.map((e: CommissionEarner) => e.commission),
              propertyMetrics.ourCommission,
            ],
            backgroundColor: [...Array(propertyMetrics.topCommissionEarners.length).fill('#FF6384'), '#36A2EB'],
          },
        ],
      }),
      [propertyMetrics]
    );

    const options: ChartOptions<'bar'> = {
      plugins: {
        legend: { display: true, position: 'top' },
        title: { display: true, text: 'Commission Comparison', font: { size: 18, weight: 'bold' } },
        tooltip: {
          callbacks: {
            label: (context) => formatCurrency(context.raw as number),
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => formatCurrency(value as number), font: { size: 12 } },
        },
        x: { ticks: { font: { size: 12 } } },
      },
    };

    return (
      <motion.div
        className="bg-white p-6 rounded-xl shadow-lg mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <svg className="w-6 h-6 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Commission Comparison
        </h2>
        <Bar data={commissionData} options={options} />
      </motion.div>
    );
  };

  const renderAgentComparison = () => {
    if (!propertyMetrics.topAgents || !propertyMetrics.ourAgentStats) {
      return <p className="text-gray-500">Agent data unavailable</p>;
    }
    const agentData = useMemo(
      () => ({
        labels: [...propertyMetrics.topAgents.map((a: Agent) => a.name), propertyMetrics.ourAgentStats.name],
        datasets: [
          {
            label: 'Sales',
            data: [...propertyMetrics.topAgents.map((a: Agent) => a.sales), propertyMetrics.ourAgentStats.sales],
            backgroundColor: [...Array(propertyMetrics.topAgents.length).fill('#FFCE56'), '#4BC0C0'],
          },
        ],
      }),
      [propertyMetrics]
    );

    const options: ChartOptions<'bar'> = {
      plugins: {
        legend: { display: true, position: 'top' },
        title: { display: true, text: 'Agent Performance', font: { size: 18, weight: 'bold' } },
        tooltip: {
          callbacks: {
            label: (context) => `${context.raw} sales`,
          },
        },
      },
      scales: {
        y: { beginAtZero: true, ticks: { font: { size: 12 } } },
        x: { ticks: { font: { size: 12 } } },
      },
    };

    return (
      <motion.div
        className="bg-white p-6 rounded-xl shadow-lg mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <svg className="w-6 h-6 mr-2 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 005.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          Agent Performance
        </h2>
        <Bar data={agentData} options={options} />
      </motion.div>
    );
  };

  const renderAgencyComparison = () => {
    if (!propertyMetrics.topAgencies || !propertyMetrics.ourAgencyStats) {
      return <p className="text-gray-500">Agency data unavailable</p>;
    }
    const agencyData = useMemo(
      () => ({
        labels: [...propertyMetrics.topAgencies.map((a: Agency) => a.name), OUR_AGENCY],
        datasets: [
          {
            label: 'Sales',
            data: [...propertyMetrics.topAgencies.map((a: Agency) => a.sales), propertyMetrics.ourAgencyStats.sales],
            backgroundColor: [...Array(propertyMetrics.topAgencies.length).fill('#FF9F40'), '#9966FF'],
          },
        ],
      }),
      [propertyMetrics]
    );

    const options: ChartOptions<'bar'> = {
      plugins: {
        legend: { display: true, position: 'top' },
        title: { display: true, text: 'Agency Performance', font: { size: 18, weight: 'bold' } },
        tooltip: {
          callbacks: {
            label: (context) => `${context.raw} sales`,
          },
        },
      },
      scales: {
        y: { beginAtZero: true, ticks: { font: { size: 12 } } },
        x: { ticks: { font: { size: 12 } } },
      },
    };

    return (
      <motion.div
        className="bg-white p-6 rounded-xl shadow-lg mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <svg className="w-6 h-6 mr-2 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a2 2 0 012-2h2a2 2 0 012 2v5m-4 0h4"
            />
          </svg>
          Agency Performance
        </h2>
        <Bar data={agencyData} options={options} />
      </motion.div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {renderTopListersComparison()}
      {renderCommissionComparison()}
      {renderAgentComparison()}
      {renderAgencyComparison()}
    </div>
  );
}