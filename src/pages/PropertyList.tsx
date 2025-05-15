import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, MapPin, DollarSign } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { Property } from '../types/Property';
import { toast } from 'react-toastify';

export function PropertyList() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        const { data, error } = await supabase
          .from('properties')
          .select('*')
          .eq('category', 'Listing')
          .order('listed_date', { ascending: false });

        if (error) throw error;
        setProperties(data || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load properties');
        toast.error(err.message || 'Failed to load properties');
      } finally {
        setLoading(false);
      }
    };

    fetchProperties();
  }, []);

  const handlePropertyClick = (property: Property) => {
    navigate(`/property-detail/${property.id}`, { state: { property } });
  };

  const handleViewPrediction = (property: Property) => {
    navigate(`/property-prediction/${property.id}`, { state: { liveData: property } });
  };

  return (
    <div className="max-w-6xl mx-auto mt-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">Available Properties</h1>
      {loading ? (
        <div className="flex justify-center items-center min-h-[400px]">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <span className="ml-2 text-gray-600">Loading properties...</span>
        </div>
      ) : error ? (
        <p className="text-red-600 text-center">{error}</p>
      ) : properties.length === 0 ? (
        <p className="text-gray-600 text-center">No properties available at the moment.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map((property) => (
            <div
              key={property.id}
              className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow"
            >
              <div onClick={() => handlePropertyClick(property)} className="cursor-pointer">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  {`${property.street_number || ''} ${property.street_name || ''}, ${property.suburb}`}
                </h2>
                <p className="text-gray-600 flex items-center mb-1">
                  <MapPin className="w-4 h-4 mr-1" />
                  {property.suburb}, QLD {property.postcode}
                </p>
                <p className="text-gray-600 flex items-center mb-1">
                  <DollarSign className="w-4 h-4 mr-1" />
                  {formatCurrency(property.price)}
                </p>
                <p className="text-gray-600 mb-1">
                  {property.bedrooms} Beds, {property.bathrooms} Baths, {property.car_garage} Garage
                </p>
                <p className="text-sm text-blue-600">{property.category}</p>
              </div>
              <button
                onClick={() => handleViewPrediction(property)}
                className="mt-2 text-blue-600 hover:underline"
              >
                View Prediction
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}