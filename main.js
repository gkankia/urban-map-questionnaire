// CONFIGURATION
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwRShukywhUdgLnCoptNE5JCVOwthMVmj42_QpAtnDGyjzhTZIFsh9iBKADW6qWelWY/exec';
        
        // Georgian word list
        const GEORGIAN_WORDS = [
            'მზე', 'მთა', 'წყალი', 'ხე', 'ყვავილი', 'ქარი', 'ღრუბელი', 'მდინარე', 'ტბა', 'ველი',
            'ტყე', 'ქვა', 'ცა', 'მიწა', 'ვარსკვლავი', 'მთვარე', 'ნისლი', 'თოვლი', 'წვიმა', 'რადიო',
            'წიგნი', 'სახლი', 'გზა', 'ხიდი', 'კარი', 'ფანჯარა', 'ბაღი', 'ეზო', 'ქუჩა', 'მოედანი',
            'ციხე', 'ეკლესია', 'მუზეუმი', 'პარკი', 'ბულვარი', 'სკვერი', 'ფონტანი', 'ძეგლი', 'თეატრი', 'კინო',
            'ყურძენი', 'ვაშლი', 'მსხალი', 'ატამი', 'ფორთოხალი', 'ლიმონი', 'ჟოლო', 'კივი', 'ბანანი', 'საზამთრო'
        ];
        
        mapboxgl.accessToken = "pk.eyJ1Ijoiam9yam9uZTkwIiwiYSI6ImNrZ3R6M2FvdTBwbmwycXBibGRqM2w2enYifQ.BxjvFSGqefuC9yFCrXC-nQ";
        
        const map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/jorjone90/cmd1cg82i000101s61qwaca16',
            center: [44.812, 41.741787],
            zoom: 12,
            attributionControl: false,
            preserveDrawingBuffer: true
        });

        map.addControl(new mapboxgl.NavigationControl());

        const geolocateControl = new mapboxgl.GeolocateControl({
            positionOptions: {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            },
            trackUserLocation: true,
            showUserHeading: true,
            fitBoundsOptions: { maxZoom: 15 }
        });

        map.addControl(geolocateControl);

        geolocateControl.on('geolocate', (e) => {
            console.log('User location:', e.coords.latitude, e.coords.longitude);
        });
        
        let marker = null;
        let surveyDataGeoJSON = { type: 'FeatureCollection', features: [] }; // GeoJSON format
        let currentFeature = null;
        let currentTab = 'survey';
        let resultsMode = 'walking';
        // --- GRID SIZE CONFIG ---

        // Fixed grid origin (southwest corner of your area)
        const ORIGIN_LNG = 41.0;   // West boundary (adjust as needed)
        const ORIGIN_LAT = 41.0;   // South boundary
        const GRID_EXTENT_LNG = 47.0; // East boundary
        const GRID_EXTENT_LAT = 44.0; // North boundary

        // Target cell size in meters (≈500 m squares)
        const GRID_SIZE_METERS = 500;

        // Convert meters → degrees (depends on latitude)
        function metersToDegrees(lat, meters) {
            const latDeg = meters / 111320; // 1° latitude ≈ 111.32 km
            const lonDeg = meters / (111320 * Math.cos(lat * Math.PI / 180));
            return { latDeg, lonDeg };
        }

        // Calculate once based on middle latitude
        const avgLat = (ORIGIN_LAT + GRID_EXTENT_LAT) / 2;
        const { latDeg, lonDeg } = metersToDegrees(avgLat, GRID_SIZE_METERS);
        const GRID_SIZE_LAT = latDeg;
        const GRID_SIZE_LNG = lonDeg;

        // Generate three-word name
        function generateThreeWordName(cellId) {
            const [x, y] = cellId.split(',').map(Number);
            const hash = Math.abs((x * 73856093) ^ (y * 19349663));
            const word1 = GEORGIAN_WORDS[hash % GEORGIAN_WORDS.length];
            const word2 = GEORGIAN_WORDS[Math.floor(hash / GEORGIAN_WORDS.length) % GEORGIAN_WORDS.length];
            const word3 = GEORGIAN_WORDS[Math.floor(hash / (GEORGIAN_WORDS.length * GEORGIAN_WORDS.length)) % GEORGIAN_WORDS.length];
            return `${word1}.${word2}.${word3}`;
        }

        // Convert coordinates → cell ID
        function getCellId(lng, lat) {
            const x = Math.floor((lng - ORIGIN_LNG) / GRID_SIZE_LNG);
            const y = Math.floor((lat - ORIGIN_LAT) / GRID_SIZE_LAT);
            return `${x},${y}`;
        }

        // Get polygon bounds for cell
        function getCellBounds(cellId) {
            const [x, y] = cellId.split(',').map(Number);
            const minLng = ORIGIN_LNG + x * GRID_SIZE_LNG;
            const minLat = ORIGIN_LAT + y * GRID_SIZE_LAT;
            return [
                [minLng, minLat],
                [minLng + GRID_SIZE_LNG, minLat],
                [minLng + GRID_SIZE_LNG, minLat + GRID_SIZE_LAT],
                [minLng, minLat + GRID_SIZE_LAT],
                [minLng, minLat]
            ];
        }

        // Get cell center
        function getCellCenter(cellId) {
            const bounds = getCellBounds(cellId);
            return [(bounds[0][0] + bounds[2][0]) / 2, (bounds[0][1] + bounds[2][1]) / 2];
        }

        // Build a fixed GeoJSON grid
        function buildFixedGrid() {
            const features = [];
            for (let lng = ORIGIN_LNG; lng < GRID_EXTENT_LNG; lng += GRID_SIZE_LNG) {
                for (let lat = ORIGIN_LAT; lat < GRID_EXTENT_LAT; lat += GRID_SIZE_LAT) {
                    const cellId = getCellId(lng, lat);
                    const bounds = getCellBounds(cellId);
                    features.push({
                        type: 'Feature',
                        geometry: { type: 'Polygon', coordinates: [bounds] },
                        properties: { cellId, count: 0 }
                    });
                }
            }
            return { type: 'FeatureCollection', features };
        }

        // --- INITIALIZATION ---
        let fixedGrid = buildFixedGrid();
        
        // Update data status
        function updateDataStatus() {
            const total = surveyDataGeoJSON.features.reduce((sum, f) => sum + f.properties.responses.length, 0);
            const cells = surveyDataGeoJSON.features.length;
            document.getElementById('totalResponses').textContent = total;
            document.getElementById('totalCells').textContent = cells;
        }
        
        // Load data from Google Sheets and convert to GeoJSON
        async function loadDataFromSheets() {
            try {
                const response = await fetch(APPS_SCRIPT_URL);
                const data = await response.json();
                
                if (data.status === 'success' && data.rows) {
                    const gridMap = {}; // Temporary map to group by gridName
                    
                    data.rows.forEach(row => {
                        const gridName = row[1];
                        const cellId = row[2];
                        const lat = parseFloat(row[3]);
                        const lng = parseFloat(row[4]);
                        
                        if (!gridMap[gridName]) {
                            const center = [lng, lat];
                            gridMap[gridName] = {
                                type: 'Feature',
                                geometry: {
                                    type: 'Point',
                                    coordinates: center
                                },
                                properties: {
                                    gridName: gridName,
                                    cellId: cellId,
                                    responses: []
                                }
                            };
                        }
                        
                        gridMap[gridName].properties.responses.push({
                            timestamp: row[0],
                            age: row[5],
                            gender: row[6],
                            vote: row[7],
                            economy: row[8],
                            priority: row[9]
                        });
                    });
                    
                    surveyDataGeoJSON.features = Object.values(gridMap);
                    
                    if (map.isStyleLoaded() && map.getSource('survey-data')) {
                        map.getSource('survey-data').setData(surveyDataGeoJSON);
                    }
                    
                    updateGridLayer();
                    updateDataStatus();
                    console.log(`Loaded ${data.rows.length} responses as ${surveyDataGeoJSON.features.length} grid features`);
                    console.log('Sample feature:', surveyDataGeoJSON.features[0]);
                }
            } catch (err) {
                console.error('Failed to load data:', err);
            }
        }
        
        // Tab switching
        function switchTab(tab) {
            currentTab = tab;
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            if (tab === 'survey') {
                document.querySelector('.tab-btn:nth-child(1)').classList.add('active');
                document.getElementById('surveyTab').classList.add('active');
                if (marker) marker.remove();
                marker = null;
                if (map.getSource('iso')) {
                    map.getSource('iso').setData({ type: 'FeatureCollection', features: [] });
                }
            } else {
                document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
                document.getElementById('resultsTab').classList.add('active');
            }
        }
        
        function setResultsMode(mode) {
            resultsMode = mode;
            document.querySelectorAll('#resultsTab .toggle').forEach(t => t.classList.remove('active'));
            document.querySelector(`#resultsTab .toggle[data-mode="${mode}"]`).classList.add('active');
            if (marker && currentTab === 'results') generateResultsIsochrone(marker.getLngLat());
        }
        
        // Aggregate results within isochrone
        function aggregateResultsInIsochrone(isochronePolygon) {
            const aggregated = {
                total: 0,
                age: {},
                gender: {},
                vote: {},
                economy: {},
                priority: {},
                grids: []
            };
            
            console.log('Starting aggregation. Total features:', surveyDataGeoJSON.features.length);
            
            surveyDataGeoJSON.features.forEach(feature => {
                const point = turf.point(feature.geometry.coordinates);
                
                try {
                    if (turf.booleanPointInPolygon(point, isochronePolygon)) {
                        const props = feature.properties;
                        console.log('Feature inside isochrone:', props.gridName, 'at', feature.geometry.coordinates, 'responses:', props.responses.length);
                        
                        aggregated.grids.push({
                            name: props.gridName,
                            count: props.responses.length
                        });
                        
                        props.responses.forEach(response => {
                            aggregated.total++;
                            if (response.age) aggregated.age[response.age] = (aggregated.age[response.age] || 0) + 1;
                            if (response.gender) aggregated.gender[response.gender] = (aggregated.gender[response.gender] || 0) + 1;
                            if (response.vote) aggregated.vote[response.vote] = (aggregated.vote[response.vote] || 0) + 1;
                            if (response.economy) aggregated.economy[response.economy] = (aggregated.economy[response.economy] || 0) + 1;
                            if (response.priority) aggregated.priority[response.priority] = (aggregated.priority[response.priority] || 0) + 1;
                        });
                    }
                } catch (err) {
                    console.error('Error checking feature:', feature.properties.gridName, err);
                }
            });
            
            console.log('Aggregation complete. Total responses:', aggregated.total, 'Grids:', aggregated.grids.length);
            return aggregated;
        }
        
        // Display aggregated results
        function displayAggregatedResults(data) {
            if (data.total === 0) {
                document.getElementById('aggregateContent').innerHTML = 
                    '<p style="text-align: center; color: #999; padding: 20px;">ამ არეალში მონაცემები არ არის</p>';
                return;
            }
            
            const voteLabels = {
                qocebi: 'ქართული ოცნება',
                lelo: 'ლელო',
                gakharia: 'გახარია',
                boycott: 'ბოიკოტი',
                undecided: 'გადაუწყვეტელი'
            };
            
            const priorityLabels = {
                economy: 'ეკონომიკა',
                democracy: 'დემოკრატია',
                eu: 'ევროინტეგრაცია',
                security: 'უსაფრთხოება',
                education: 'განათლება'
            };
            
            const economyLabels = {
                very_good: 'ძალიან კარგი',
                good: 'კარგი',
                neutral: 'საშუალო',
                bad: 'ცუდი',
                very_bad: 'ძალიან ცუდი'
            };
            
            let html = `<div class="aggregate-stat"><strong>სულ პასუხი:</strong> ${data.total}</div>`;
            
            if (Object.keys(data.vote).length > 0) {
                html += '<h4 style="margin-top: 15px; margin-bottom: 8px; color: #333;">პარტიული გადანაწილება:</h4>';
                const sortedVotes = Object.entries(data.vote).sort((a, b) => b[1] - a[1]);
                sortedVotes.forEach(([key, count]) => {
                    const pct = ((count / data.total) * 100).toFixed(1);
                    html += `<div class="aggregate-stat">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                            <span>${voteLabels[key] || key}</span>
                            <span><strong>${count}</strong> (${pct}%)</span>
                        </div>
                        <div class="chart-bar" style="width: ${pct}%;">
                            <span class="chart-label">${pct}%</span>
                        </div>
                    </div>`;
                });
            }
            
            if (Object.keys(data.priority).length > 0) {
                html += '<h4 style="margin-top: 15px; margin-bottom: 8px; color: #333;">პრიორიტეტები:</h4>';
                const sortedPriority = Object.entries(data.priority).sort((a, b) => b[1] - a[1]);
                sortedPriority.forEach(([key, count]) => {
                    const pct = ((count / data.total) * 100).toFixed(1);
                    html += `<div class="aggregate-stat">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                            <span>${priorityLabels[key] || key}</span>
                            <span><strong>${count}</strong> (${pct}%)</span>
                        </div>
                        <div class="chart-bar" style="width: ${pct}%;">
                            <span class="chart-label">${pct}%</span>
                        </div>
                    </div>`;
                });
            }
            
            if (Object.keys(data.economy).length > 0) {
                html += '<h4 style="margin-top: 15px; margin-bottom: 8px; color: #333;">ეკონომიკის შეფასება:</h4>';
                const sortedEconomy = Object.entries(data.economy).sort((a, b) => b[1] - a[1]);
                sortedEconomy.forEach(([key, count]) => {
                    const pct = ((count / data.total) * 100).toFixed(1);
                    html += `<div class="aggregate-stat">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                            <span>${economyLabels[key] || key}</span>
                            <span><strong>${count}</strong> (${pct}%)</span>
                        </div>
                        <div class="chart-bar" style="width: ${pct}%;">
                            <span class="chart-label">${pct}%</span>
                        </div>
                    </div>`;
                });
            }
            
            html += '<h4 style="margin-top: 15px; margin-bottom: 8px; color: #333;">დემოგრაფია:</h4>';
            if (Object.keys(data.age).length > 0) {
                html += '<div class="aggregate-stat"><strong>ასაკი:</strong><br>';
                Object.entries(data.age).sort().forEach(([key, count]) => {
                    const pct = ((count / data.total) * 100).toFixed(1);
                    html += `<span style="font-size: 11px;">${key}: ${count} (${pct}%)</span> | `;
                });
                html += '</div>';
            }
            
            if (Object.keys(data.gender).length > 0) {
                html += '<div class="aggregate-stat"><strong>სქესი:</strong><br>';
                const genderLabels = { male: 'მამრობითი', female: 'მდედრობითი', other: 'სხვა' };
                Object.entries(data.gender).forEach(([key, count]) => {
                    const pct = ((count / data.total) * 100).toFixed(1);
                    html += `<span style="font-size: 11px;">${genderLabels[key] || key}: ${count} (${pct}%)</span> | `;
                });
                html += '</div>';
            }
            
            document.getElementById('aggregateContent').innerHTML = html;
        }
        
        // Modal setup
        const modal = document.getElementById('modal');
        document.querySelector('.close').onclick = () => modal.style.display = 'none';
        window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
        
        // Form submission
        document.getElementById('surveyForm').onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const cellId = currentFeature.properties.cellId;
            const center = getCellCenter(cellId);
            const gridName = currentFeature.properties.gridName;
            
            const response = {
                timestamp: new Date().toISOString(),
                gridName: gridName,
                cellId: cellId,
                lat: center[1],
                lng: center[0],
                age: formData.get('age'),
                gender: formData.get('gender'),
                vote: formData.get('vote'),
                economy: formData.get('economy'),
                priority: formData.get('priority')
            };
            
            // Find existing feature or create new one
            let feature = surveyDataGeoJSON.features.find(f => f.properties.gridName === gridName);
            if (!feature) {
                feature = {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: center
                    },
                    properties: {
                        gridName: gridName,
                        cellId: cellId,
                        responses: []
                    }
                };
                surveyDataGeoJSON.features.push(feature);
            }
            
            feature.properties.responses.push({
                timestamp: response.timestamp,
                age: response.age,
                gender: response.gender,
                vote: response.vote,
                economy: response.economy,
                priority: response.priority
            });
            
            // Update map source
            if (map.getSource('survey-data')) {
                map.getSource('survey-data').setData(surveyDataGeoJSON);
            }
            
            // Send to Google Sheets
            try {
                await fetch(APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify(response)
                });
                console.log('Data sent to Google Sheets successfully');
            } catch (err) {
                console.error('Failed to send to Google Sheets:', err);
            }
            
            alert('მადლობა! თქვენი პასუხი შენახულია.');
            modal.style.display = 'none';
            e.target.reset();
            updateGridLayer();
            updateDataStatus();
        };
        
        // Update grid visualization
        function updateGridLayer() {
            const bounds = map.getBounds();
            const center = map.getCenter();
        
            // Dynamically recalc grid size for latitude (to stay square-ish)
            const { latDeg, lonDeg } = metersToDegrees(center.lat, GRID_SIZE_METERS);
            GRID_SIZE_LAT = latDeg;
            GRID_SIZE_LNG = lonDeg;
        
            const minLng = bounds.getWest();
            const maxLng = bounds.getEast();
            const minLat = bounds.getSouth();
            const maxLat = bounds.getNorth();
        
            const features = [];
            const existingGrids = {};
        
            // Map existing survey data
            surveyDataGeoJSON.features.forEach(f => {
                existingGrids[f.properties.cellId] = {
                    gridName: f.properties.gridName,
                    count: f.properties.responses.length
                };
            });
        
            // Generate only visible grids (aligned to world grid)
            for (let lng = Math.floor(minLng / GRID_SIZE_LNG) * GRID_SIZE_LNG; lng <= maxLng; lng += GRID_SIZE_LNG) {
                for (let lat = Math.floor(minLat / GRID_SIZE_LAT) * GRID_SIZE_LAT; lat <= maxLat; lat += GRID_SIZE_LAT) {
                    const cellId = getCellId(lng, lat);
                    const coords = getCellBounds(cellId);
                    const existing = existingGrids[cellId];
                    const count = existing ? existing.count : 0;
                    const gridName = existing ? existing.gridName : generateThreeWordName(cellId);
        
                    // Only show grids when zoomed in enough or if data exists
                    if (count > 0 || map.getZoom() > 12) {
                        features.push({
                            type: 'Feature',
                            properties: { 
                                cellId, 
                                gridName,
                                count, 
                                hasData: count > 0
                            },
                            geometry: { type: 'Polygon', coordinates: [coords] }
                        });
                    }
                }
            }
        
            if (map.getSource('grid')) {
                map.getSource('grid').setData({ type: 'FeatureCollection', features });
            }
        }
        
        // Map click handler
        map.on('click', (e) => {
            if (currentTab === 'survey') {
                const features = map.queryRenderedFeatures(e.point, { layers: ['grid-layer'] });
                
                if (features.length > 0) {
                    const props = features[0].properties;

                    // Ensure gridName exists
                    const gridName = props.gridName || generateThreeWordName(props.cellId);

                    currentFeature = {
                        properties: {
                            cellId: props.cellId,
                            gridName: gridName,
                            count: props.count
                        }
                    };
                    
                    const center = getCellCenter(props.cellId);
                    
                    document.getElementById('cellInfo').innerHTML = 
                        `<div class="three-word-name">${gridName}</div>` +
                        `<strong>Grid ID:</strong> ${props.cellId}<br>` +
                        `<strong>ცენტრი:</strong> ${center[1].toFixed(6)}, ${center[0].toFixed(6)}<br>` +
                        `<strong>ზომა:</strong> ~200m x 200m<br>` +
                        `<strong>არსებული პასუხები:</strong> ${props.count}`;
                    modal.style.display = 'block';
                }
            } else {
                if (marker) marker.remove();
                marker = new mapboxgl.Marker({ color: '#6c86cf' }).setLngLat(e.lngLat).addTo(map);
                generateResultsIsochrone(e.lngLat);
            }
        });
                
        // Generate isochrone
        function generateResultsIsochrone(lngLat) {
            const time = document.getElementById('timeResults').value;
            const url = `https://api.mapbox.com/isochrone/v1/mapbox/${resultsMode}/${lngLat.lng},${lngLat.lat}?contours_minutes=${time}&polygons=true&access_token=${mapboxgl.accessToken}`;
            
            console.log('Generating isochrone. Survey features available:', surveyDataGeoJSON.features.length);
            
            fetch(url)
                .then(r => r.json())
                .then(data => {
                    console.log('Isochrone received');
                    
                    if (map.getSource('iso')) {
                        map.getSource('iso').setData(data);
                    }
                    
                    if (data.features && data.features.length > 0) {
                        const isochroneFeature = data.features[0];
            
                        // Fit map to isochrone bbox
                        const bbox = turf.bbox(isochroneFeature); // <-- requires turf.js
                        map.fitBounds(bbox, {
                            padding: 50,
                            bearing: 0,
                            pitch: 55,
                            maxZoom: 20,
                            minZoom: 12 // slightly lower to allow context
                        });
            
                        const aggregated = aggregateResultsInIsochrone(isochroneFeature);
                        displayAggregatedResults(aggregated);
                        document.getElementById('aggregateResults').style.display = 'block';
                    } else {
                        console.warn('No isochrone features returned');
                        document.getElementById('aggregateResults').style.display = 'none';
                    }
                })
                .catch(err => {
                    console.error('Isochrone error:', err);
                    alert('შეცდომა იზოქრონის შექმნისას: ' + err.message);
                });
        }
        
        // Time change
        document.getElementById('timeResults').onchange = () => {
            if (marker && currentTab === 'results') generateResultsIsochrone(marker.getLngLat());
        };
        
        // Initialize map layers
        map.on('load', () => {
            // Grid layer for visualization
            map.addSource('grid', { type: 'geojson', data: fixedGrid });
            
            map.addLayer({
                id: 'grid-layer',
                type: 'fill',
                source: 'grid',
                paint: {
                    'fill-color': [
                        'case',
                        ['>', ['get', 'count'], 0],
                        ['interpolate', ['linear'], ['get', 'count'],
                            1, '#e3f0fc',
                            5, '#6c86cf',
                            10, '#4a6bb0'
                        ],
                        '#ffffff'
                    ],
                    'fill-opacity': 0.05
                },
                minzoom: 12,   // 👈 grid appears only when zoom >= 12
                //maxzoom: 22    // 👈 (optional) disappears if zoom > 22
            });
            
            map.addLayer({
                id: 'grid-outline',
                type: 'line',
                source: 'grid',
                paint: {
                    'line-color': '#6c86cf',
                    'line-opacity': 0.25,
                    'line-width': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        10, 0.5,   // at zoom 10 → line width 0.5
                        12, 0.75,     // at zoom 12 → line width 1
                        14, 1,     // at zoom 14 → line width 2
                        16, 3      // at zoom 16 → line width 3
                    ]
                }
            });
            
            // Survey data layer (points for spatial analysis)
            map.addSource('survey-data', {
                type: 'geojson',
                data: surveyDataGeoJSON
            });
            
            // Isochrone layer
            map.addSource('iso', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });
            
            map.addLayer({
                id: 'iso-layer',
                type: 'fill',
                source: 'iso',
                paint: {
                    'fill-color': '#6c86cf',
                    'fill-opacity': 0.2
                }
            });
            
            map.addLayer({
                id: 'iso-outline',
                type: 'line',
                source: 'iso',
                paint: {
                    'line-color': '#6c86cf',
                    'line-width': 2
                }
            });
            
            // Load data after map is ready
            loadDataFromSheets();
            updateGridLayer();
        });

        map.on('moveend', () => {
            updateGridLayer(); // refresh visible grid
        });
        
        map.on('zoomend', updateGridLayer);
        
        updateDataStatus();