import { MapContainer, TileLayer, FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import L from 'leaflet';

// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapComponentProps {
    onCoordsChange: (latlngs: L.LatLng[]) => void;
}

const MapComponent: React.FC<MapComponentProps> = ({ onCoordsChange }) => {
  const onCreated = (e: any) => {
    const layer = e.layer;
    // For polygons, getLatLngs() returns an array of arrays (for holes). We take the first one.
    const latlngs = layer.getLatLngs()[0];
    console.log('Polygon coordinates:', latlngs);
    onCoordsChange(latlngs);
  };

  return (
    <MapContainer center={[51.505, -0.09]} zoom={5} style={{ height: '300px', width: '100%', borderRadius: '8px' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <FeatureGroup>
        <EditControl
          position="topright"
          onCreated={onCreated}
          draw={{
            rectangle: false,
            polyline: false,
            circle: false,
            circlemarker: false,
            marker: false,
            polygon: {
              allowIntersection: false,
              drawError: {
                color: '#e1e1e1',
                timeout: 1000,
              },
              shapeOptions: {
                color: '#22c55e', // green-500
              },
            },
          }}
          edit={{}} // FeatureGroup provided by parent; do not set featureGroup here
        />
      </FeatureGroup>
    </MapContainer>
  );
};

export default MapComponent;