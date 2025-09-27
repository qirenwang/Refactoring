let map;
let marker;
let existingMarkers = [];

function initMap() {
    // 确保地图容器存在
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        console.error('Map container not found');
        return;
    }

    // 如果地图已经初始化，先移除它
    if (map) {
        map.remove();
    }

    // 以五大湖为中心的初始视图
    const greatLakesCenter = [45.0, -84.0];
    const initialZoom = 5;

    // 初始化地图
    try {
        map = L.map('map').setView(greatLakesCenter, initialZoom);

        // 添加 OpenStreetMap 图层
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // 设置地图边界（围绕五大湖区域）
        const southWest = L.latLng(41.0, -93.0);
        const northEast = L.latLng(49.0, -75.0);
        const bounds = L.latLngBounds(southWest, northEast);
        map.setMaxBounds(bounds);
        map.setMinZoom(5);

        // 加载已有的位置标记
        loadExistingLocations();

        // 点击地图时更新坐标
        map.on('click', function(e) {
            updateMarkerAndCoordinates(e.latlng.lat, e.latlng.lng);
        });

        // 监听坐标输入框的变化
        const latInput = document.getElementById('latitude');
        const lngInput = document.getElementById('longitude');
        
        if (latInput && lngInput) {
            latInput.addEventListener('input', updateMapFromInput);
            lngInput.addEventListener('input', updateMapFromInput);
        }

        // 强制重新计算地图大小
        setTimeout(() => {
            map.invalidateSize();
        }, 100);

        console.log('Map initialized successfully');
    } catch (error) {
        console.error('Error initializing map:', error);
    }
}

function loadExistingLocations() {
    fetch('forms/get_locations.php')
        .then(response => response.json())
        .then(locations => {
            // 清除现有标记
            existingMarkers.forEach(marker => marker.remove());
            existingMarkers = [];

            // 添加新标记
            locations.forEach(loc => {
                const existingMarker = L.circleMarker([loc.lat, loc.lng], {
                    radius: 8,
                    fillColor: '#ff4444',
                    color: '#000',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(map);

                // 添加点击事件和弹出信息
                existingMarker.bindPopup(`
                    <strong>${loc.name}</strong><br>
                    Lat: ${loc.lat}<br>
                    Lng: ${loc.lng}<br>
                    <button onclick="selectLocation(${loc.lat}, ${loc.lng})">Select this location</button>
                `);

                existingMarkers.push(existingMarker);
            });
        })
        .catch(error => console.error('Error loading locations:', error));
}

function selectLocation(lat, lng) {
    updateMarkerAndCoordinates(lat, lng);
    map.closePopup();
}

function updateMarkerAndCoordinates(lat, lng) {
    // 更新输入框，保留6位小数
    document.getElementById('latitude').value = lat.toFixed(6);
    document.getElementById('longitude').value = lng.toFixed(6);

    // 更新或创建标记
    if (marker) {
        marker.setLatLng([lat, lng]);
    } else {
        marker = L.marker([lat, lng]).addTo(map);
    }
}

function updateMapFromInput() {
    const lat = parseFloat(document.getElementById('latitude').value);
    const lng = parseFloat(document.getElementById('longitude').value);

    if (!isNaN(lat) && !isNaN(lng)) {
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            updateMarkerAndCoordinates(lat, lng);
            map.setView([lat, lng]);
        }
    }
}

// 移除原有的 DOMContentLoaded 事件监听器
// 现在由 main.js 中的 loadForm 函数来调用 initMap 