import { Bar } from 'react-chartjs-2';
import { ChartOptions } from 'chart.js';
import { PropertyMetrics } from './types/types';
import { motion } from 'framer-motion';
import { formatCurrency } from './Reports'; // Importing formatCurrency from Reports.tsx

interface ComparisonsProps {
  propertyMetrics: PropertyMetrics | null;
  isLoading: boolean;
}

export function Comparisons({ propertyMetrics, isLoading }: ComparisonsProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <svg className="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  if (!propertyMetrics) {
    return <p className="text-gray-500 text-center py-4">No comparison data available.</p>;
  }

  // Helper function to format numbers
  const formatNumber = (value: number) => value.toLocaleString();

  // 1. Top Listers by Suburb vs Our Position
  const renderTopListersBySuburb = () => {
    const suburbs = Object.keys(propertyMetrics.topListersBySuburb);
    const tableData = suburbs.map((suburb) => ({
      suburb,
      topLister: propertyMetrics.topListersBySuburb[suburb].agent,
      topListerCount: propertyMetrics.topListersBySuburb[suburb].count,
      ourListings: propertyMetrics.ourListingsBySuburb[suburb] || 0,
    }));

    return (
      <motion.div
        className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <svg className="w-6 h-6 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Top Listers by Suburb vs Our Position
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white">
                <th className="p-4 text-left text-sm font-semibold">Suburb</th>
                <th className="p-4 text-left text-sm font-semibold">Top Lister</th>
                <th className="p-4 text-left text-sm font-semibold">Top Lister Count</th>
                <th className="p-4 text-left text-sm font-semibold">Our Listings</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, index) => (
                <motion.tr
                  key={row.suburb}
                  className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                >
                  <td className="p-4 text-gray-700">{row.suburb}</td>
                  <td className="p-4 text-gray-700">{row.topLister || 'N/A'}</td>
                  <td className="p-4 text-gray-700">{formatNumber(row.topListerCount)}</td>
                  <td className="p-4 text-gray-700">{formatNumber(row.ourListings)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    );
  };

  // 2. Highest-Earning Agents by Commission vs Our Performance
  const renderCommissionComparison = () => {
    const labels = [...propertyMetrics.topCommissionEarners.map(e => e.agent), propertyMetrics.ourAgentStats.name];
    const data = [...propertyMetrics.topCommissionEarners.map(e => e.commission), propertyMetrics.ourCommission];

    const commissionData = {
      labels,
      datasets: [
        {
          label: 'Commission Earned',
          data,
          backgroundColor: [...Array(propertyMetrics.topCommissionEarners.length).fill('#36A2EB'), '#FF6384'],
        },
      ],
    };

    const options: ChartOptions<'bar'> = {
      plugins: {
        legend: { position: 'top', labels: { font: { size: 14 } } },
        title: { display: true, text: 'Top Commission Earners vs Our Performance', font: { size: 18, weight: 'bold' } },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${formatCurrency(context.raw as number)}`,
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
        className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <svg className="w-6 h-6 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Top Commission Earners vs Our Performance
        </h3>
        <Bar data={commissionData} options={options} />
      </motion.div>
    );
  };

  // 3. Leading Individual Agents vs Our Results
  const renderAgentSalesComparison = () => {
    const labels = [...propertyMetrics.topAgents.map(a => a.name), propertyMetrics.ourAgentStats.name];
    const data = [...propertyMetrics.topAgents.map(a => a.sales), propertyMetrics.ourAgentStats.sales];

    const agentData = {
      labels,
      datasets: [
        {
          label: 'Sales Count',
          data,
          backgroundColor: [...Array(propertyMetrics.topAgents.length).fill('#36A2EB'), '#FF6384'],
        },
      ],
    };

    const options: ChartOptions<'bar'> = {
      plugins: {
        legend: { position: 'top', labels: { font: { size: 14 } } },
        title: { display: true, text: 'Top Agents by Sales vs Our Performance', font: { size: 18, weight: 'bold' } },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${formatNumber(context.raw as number)}`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { font: { size: 12 } },
        },
        x: { ticks: { font: { size: 12 } } },
      },
    };

    return (
      <motion.div
        className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <svg className="w-6 h-6 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a2 2 0 00-2-2h-3m-2 4h-5v-2a2 2 0 012-2h3m-2-4H7a2 2 0 00-2 2v2h5m2-4h5V7a2 2 0 00-2-2h-3m2 4H7" />
          </svg>
          Top Agents by Sales vs Our Performance
        </h3>
        <Bar data={agentData} options={options} />
      </motion.div>
    );
  };

  // 4. Top-Selling Agencies vs Our Standings
  const renderAgencySalesComparison = () => {
    const labels = [...propertyMetrics.topAgencies.map(a => a.name), propertyMetrics.ourAgencyStats.name];
    const data = [...propertyMetrics.topAgencies.map(a => a.sales), propertyMetrics.ourAgencyStats.sales];

    const agencyData = {
      labels,
      datasets: [
        {
          label: 'Sales Count',
          data,
          backgroundColor: [...Array(propertyMetrics.topAgencies.length).fill('#36A2EB'), '#FF6384'],
        },
      ],
    };

    const options: ChartOptions<'bar'> = {
      plugins: {
        legend: { position: 'top', labels: { font: { size: 14 } } },
        title: { display: true, text: 'Top Agencies by Sales vs Our Standings', font: { size: 18, weight: 'bold' } },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${formatNumber(context.raw as number)}`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { font: { size: 12 } },
        },
        x: { ticks: { font: { size: 12 } } },
      },
    };

    return (
      <motion.div
        className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <svg className="w-6 h-6 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a2 2 0 012-2h2a2 2 0 012 2v5m-4 0h-4" />
          </svg>
          Top Agencies by Sales vs Our Standings
        </h3>
        <Bar data={agencyData} options={options} />
      </motion.div>
    );
  };

  return (
    <div className="space-y-8">
      {renderTopListersBySuburb()}
      {renderCommissionComparison()}
      {renderAgentSalesComparison()}
      {renderAgencySalesComparison()}
    </div>
  );
}