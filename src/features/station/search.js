/**
 * src/features/station/search.js - USGS site search (code or river name).
 * public: searchStation()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 * NOTE: the WA-only `stateCd=wa` query becomes region-driven in UPDATE 3.0 Phase 2.
 */
async function searchStation() {
    var term = document.getElementById('station-search').value.trim();
    var resultsBox = document.getElementById('search-results');
    
    if (!term) return;
    resultsBox.style.display = 'block';
    resultsBox.innerHTML = '<div style="color:var(--accent-yellow); font-weight:bold; padding:8px;">Searching...</div>';
    
    // If exact 8 digit gauge ID
    if (term.match(/^\d{8}$/)) {
        resultsBox.innerHTML = '<div style="color:var(--accent-yellow); font-weight:bold; padding:8px;">Fetching metadata...</div>';
        var url = 'https://waterservices.usgs.gov/nwis/iv/?format=json&sites=' + term + '&parameterCd=00060,00065&siteStatus=all';
        try {
            var response = await fetch(url);
            var data = await response.json();
            var timeSeries = data.value.timeSeries;
            if (timeSeries && timeSeries.length > 0) {
                var info = timeSeries[0].sourceInfo;
                var name = info.siteName;
                var sLoc = info.geoLocation.geogLocation;
                var lat = sLoc.latitude;
                var lon = sLoc.longitude;
                
                resultsBox.innerHTML = '<button class="preset-btn" onclick="selectPreset(\''+term+'\', '+lat+', '+lon+', \''+name.replace(/'/g, "\\'")+'\')" style="margin:5px 0;">' +
                    '<span>'+name+'</span> <span class="preset-id">'+term+'</span></button>';
            } else {
                resultsBox.innerHTML = '<div style="color:var(--accent-red); font-weight:bold; padding:8px;">❌ USGS Station ID not found or inactive.</div>';
            }
        } catch(e) {
            resultsBox.innerHTML = '<div style="color:var(--accent-red); font-weight:bold; padding:8px;">❌ Search Error.</div>';
            logDebug("USGS Search error: " + e.message, "ERR");
        }
        return;
    }

    // Search by river name in Washington State (stateCd=wa)
    resultsBox.innerHTML = '<div style="color:var(--accent-yellow); font-weight:bold; padding:8px;">Searching Washington rivers...</div>';
    var url = 'https://waterservices.usgs.gov/nwis/iv/?format=json&stateCd=wa&parameterCd=00060,00065&siteStatus=all';
    try {
        var response = await fetch(url);
        var data = await response.json();
        var timeSeries = data.value.timeSeries;
        if (!timeSeries || timeSeries.length === 0) {
            resultsBox.innerHTML = '<div style="color:var(--accent-red); font-weight:bold; padding:8px;">❌ No active stations found.</div>';
            return;
        }
        
        var stationsMap = {};
        var searchTermLower = term.toLowerCase();
        timeSeries.forEach(function(ts) {
            var sCode = ts.sourceInfo.siteCode[0].value;
            var sName = ts.sourceInfo.siteName;
            var sLoc = ts.sourceInfo.geoLocation.geogLocation;
            var sLat = sLoc.latitude;
            var sLon = sLoc.longitude;
            
            if (sName.toLowerCase().indexOf(searchTermLower) !== -1) {
                stationsMap[sCode] = {
                    id: sCode,
                    name: sName,
                    lat: sLat,
                    lon: sLon
                };
            }
        });
        
        var results = Object.values(stationsMap);
        if (results.length === 0) {
            resultsBox.innerHTML = '<div style="color:var(--accent-red); font-weight:bold; padding:8px;">❌ No matching active stations found.</div>';
        } else {
            resultsBox.innerHTML = '<div style="color:var(--text-muted); font-size:10px; padding:4px;">Showing top ' + Math.min(10, results.length) + ' matches:</div>';
            // Show up to 10 results
            results.slice(0, 10).forEach(function(s) {
                var safeName = s.name.replace(/'/g, "\\'");
                resultsBox.innerHTML += '<button class="preset-btn" onclick="selectPreset(\''+s.id+'\', '+s.lat+', '+s.lon+', \''+safeName+'\')" style="margin:5px 0;">' +
                    '<span>'+s.name+'</span> <span class="preset-id">'+s.id+'</span></button>';
            });
        }
    } catch(e) {
        resultsBox.innerHTML = '<div style="color:var(--accent-red); font-weight:bold; padding:8px;">❌ Search Error.</div>';
        logDebug("USGS search error: " + e.message, "ERR");
    }
}
