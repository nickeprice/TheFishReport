/* GENERATED - do not edit by hand.
 * Source: scripts/precompute_spot_widths.py
 *
 * Channel widths measured from 3DEP DEM (AWS Terrain Tiles / terrarium z15)
 * at ~500m intervals along 5 core rivers.
 *
 * Each entry:
 *   lat,lon     = WGS84 sample point
 *   cum_m       = cumulative river distance from downstream end (metres)
 *   wetted_ft   = channel width at ~2m above thalweg (wetted width proxy)
 *   bankfull_ft = width at the highest measured elevation (bankfull proxy)
 *   thalweg_m   = thalweg elevation above sea level (metres)
 *   truncated   = DEM window was too small for this cross-section
 */
window.SPOT_WIDTHS = window.SPOT_WIDTHS || {};
window.SPOT_WIDTHS.rivers = {

    "snoqualmie": {
        "name": "Snoqualmie River",
        "site_id": "12144500",
        "n_points": 78,
        "points": [
            {"lat":47.51723, "lon":-121.60353, "cum_m":0.0, "wetted_ft":1016.2, "bankfull_ft":1048.0, "thalweg_m":265.49, "truncated":true},
            {"lat":47.51726, "lon":-121.60369, "cum_m":100, "wetted_ft":868.0, "bankfull_ft":868.0, "thalweg_m":265.49, "truncated":true},
            {"lat":47.51733, "lon":-121.60415, "cum_m":200, "wetted_ft":836.2, "bankfull_ft":857.4, "thalweg_m":265.48, "truncated":false},
            {"lat":47.51751, "lon":-121.60565, "cum_m":300, "wetted_ft":656.3, "bankfull_ft":751.6, "thalweg_m":264.19, "truncated":false},
            {"lat":47.5174, "lon":-121.60671, "cum_m":400, "wetted_ft":666.9, "bankfull_ft":688.1, "thalweg_m":264.19, "truncated":true},
            {"lat":47.51649, "lon":-121.60739, "cum_m":500, "wetted_ft":243.5, "bankfull_ft":307.0, "thalweg_m":264.19, "truncated":false},
            {"lat":47.51502, "lon":-121.60695, "cum_m":600, "wetted_ft":719.8, "bankfull_ft":772.8, "thalweg_m":263.29, "truncated":false},
            {"lat":47.51414, "lon":-121.60659, "cum_m":700, "wetted_ft":1016.3, "bankfull_ft":1048.0, "thalweg_m":263.29, "truncated":true},
            {"lat":47.51353, "lon":-121.60675, "cum_m":800, "wetted_ft":328.2, "bankfull_ft":836.3, "thalweg_m":262.49, "truncated":false},
            {"lat":47.5116, "lon":-121.60897, "cum_m":900, "wetted_ft":1079.8, "bankfull_ft":1312.7, "thalweg_m":261.07, "truncated":false},
            {"lat":47.50897, "lon":-121.61319, "cum_m":1000, "wetted_ft":381.1, "bankfull_ft":550.5, "thalweg_m":259.87, "truncated":false},
            {"lat":47.50895, "lon":-121.61339, "cum_m":1100, "wetted_ft":550.5, "bankfull_ft":561.1, "thalweg_m":259.87, "truncated":true},
            {"lat":47.50864, "lon":-121.61617, "cum_m":1200, "wetted_ft":804.6, "bankfull_ft":910.5, "thalweg_m":259.28, "truncated":true},
            {"lat":47.50773, "lon":-121.62123, "cum_m":1300, "wetted_ft":910.5, "bankfull_ft":910.5, "thalweg_m":256.97, "truncated":true},
            {"lat":47.50682, "lon":-121.61942, "cum_m":1400, "wetted_ft":1154.0, "bankfull_ft":1154.0, "thalweg_m":256.99, "truncated":true},
            {"lat":47.50581, "lon":-121.61859, "cum_m":1500, "wetted_ft":677.6, "bankfull_ft":688.2, "thalweg_m":256.73, "truncated":true},
            {"lat":47.50441, "lon":-121.61974, "cum_m":1600, "wetted_ft":804.7, "bankfull_ft":878.8, "thalweg_m":256.39, "truncated":true},
            {"lat":47.50452, "lon":-121.62212, "cum_m":1700, "wetted_ft":984.7, "bankfull_ft":1270.6, "thalweg_m":256.39, "truncated":false},
            {"lat":47.5039, "lon":-121.62638, "cum_m":1800, "wetted_ft":571.8, "bankfull_ft":667.1, "thalweg_m":255.45, "truncated":true},
            {"lat":47.50249, "lon":-121.62568, "cum_m":1900, "wetted_ft":1016.5, "bankfull_ft":1101.2, "thalweg_m":255.43, "truncated":false},
            {"lat":47.5019, "lon":-121.62548, "cum_m":2000, "wetted_ft":698.8, "bankfull_ft":953.0, "thalweg_m":255.43, "truncated":true},
            {"lat":47.5016, "lon":-121.6259, "cum_m":2100, "wetted_ft":550.6, "bankfull_ft":635.3, "thalweg_m":255.4, "truncated":true},
            {"lat":47.49899, "lon":-121.63091, "cum_m":2200, "wetted_ft":921.3, "bankfull_ft":974.2, "thalweg_m":252.6, "truncated":true},
            {"lat":47.49731, "lon":-121.63325, "cum_m":2300, "wetted_ft":360.0, "bankfull_ft":476.5, "thalweg_m":252.89, "truncated":false},
            {"lat":47.49538, "lon":-121.64071, "cum_m":2400, "wetted_ft":158.8, "bankfull_ft":233.0, "thalweg_m":249.47, "truncated":false},
            {"lat":47.49528, "lon":-121.64095, "cum_m":2500, "wetted_ft":190.6, "bankfull_ft":328.3, "thalweg_m":249.47, "truncated":false},
            {"lat":47.49248, "lon":-121.64453, "cum_m":2600, "wetted_ft":518.9, "bankfull_ft":635.4, "thalweg_m":244.14, "truncated":true},
            {"lat":47.49135, "lon":-121.64496, "cum_m":2700, "wetted_ft":285.9, "bankfull_ft":338.9, "thalweg_m":242.89, "truncated":false},
            {"lat":47.48564, "lon":-121.6486, "cum_m":2800, "wetted_ft":794.4, "bankfull_ft":889.7, "thalweg_m":235.19, "truncated":false},
            {"lat":47.4843, "lon":-121.6517, "cum_m":2900, "wetted_ft":190.7, "bankfull_ft":233.0, "thalweg_m":223.43, "truncated":false},
            {"lat":47.48381, "lon":-121.65299, "cum_m":3000, "wetted_ft":222.4, "bankfull_ft":254.2, "thalweg_m":223.21, "truncated":false},
            {"lat":47.4805, "lon":-121.65984, "cum_m":3100, "wetted_ft":190.7, "bankfull_ft":222.5, "thalweg_m":223.08, "truncated":false},
            {"lat":47.47999, "lon":-121.65994, "cum_m":3200, "wetted_ft":158.9, "bankfull_ft":180.1, "thalweg_m":223.08, "truncated":false},
            {"lat":47.47756, "lon":-121.66249, "cum_m":3300, "wetted_ft":487.3, "bankfull_ft":550.9, "thalweg_m":223.05, "truncated":false},
            {"lat":47.47299, "lon":-121.67071, "cum_m":3400, "wetted_ft":550.9, "bankfull_ft":550.9, "thalweg_m":218.25, "truncated":true},
            {"lat":47.47173, "lon":-121.67326, "cum_m":3500, "wetted_ft":222.5, "bankfull_ft":275.5, "thalweg_m":218.07, "truncated":false},
            {"lat":47.47227, "lon":-121.67829, "cum_m":3600, "wetted_ft":211.9, "bankfull_ft":381.4, "thalweg_m":215.97, "truncated":false},
            {"lat":47.47198, "lon":-121.68382, "cum_m":3700, "wetted_ft":233.1, "bankfull_ft":254.3, "thalweg_m":209.72, "truncated":true},
            {"lat":47.47629, "lon":-121.68803, "cum_m":3800, "wetted_ft":190.7, "bankfull_ft":222.5, "thalweg_m":200.25, "truncated":false},
            {"lat":47.4769, "lon":-121.69022, "cum_m":3900, "wetted_ft":148.3, "bankfull_ft":180.1, "thalweg_m":200.19, "truncated":false},
            {"lat":47.47691, "lon":-121.69065, "cum_m":4000, "wetted_ft":84.7, "bankfull_ft":116.5, "thalweg_m":200.19, "truncated":false},
            {"lat":47.47859, "lon":-121.70459, "cum_m":4100, "wetted_ft":349.6, "bankfull_ft":402.5, "thalweg_m":188.88, "truncated":true},
            {"lat":47.4781, "lon":-121.71256, "cum_m":4200, "wetted_ft":307.2, "bankfull_ft":349.6, "thalweg_m":177.66, "truncated":false},
            {"lat":47.47839, "lon":-121.714, "cum_m":4300, "wetted_ft":381.4, "bankfull_ft":455.5, "thalweg_m":176.46, "truncated":false},
            {"lat":47.47839, "lon":-121.71779, "cum_m":4400, "wetted_ft":296.6, "bankfull_ft":339.0, "thalweg_m":183.73, "truncated":true},
            {"lat":47.47888, "lon":-121.7194, "cum_m":4500, "wetted_ft":105.9, "bankfull_ft":148.3, "thalweg_m":176.51, "truncated":false},
            {"lat":47.47934, "lon":-121.72191, "cum_m":4600, "wetted_ft":444.9, "bankfull_ft":868.6, "thalweg_m":176.4, "truncated":true},
            {"lat":47.47783, "lon":-121.73638, "cum_m":4700, "wetted_ft":593.2, "bankfull_ft":699.2, "thalweg_m":163.29, "truncated":true},
            {"lat":47.47805, "lon":-121.74075, "cum_m":4800, "wetted_ft":646.2, "bankfull_ft":868.7, "thalweg_m":158.41, "truncated":true},
            {"lat":47.47926, "lon":-121.74323, "cum_m":4900, "wetted_ft":699.1, "bankfull_ft":932.2, "thalweg_m":159.26, "truncated":true},
            {"lat":47.48005, "lon":-121.74522, "cum_m":5000, "wetted_ft":487.3, "bankfull_ft":646.2, "thalweg_m":156.79, "truncated":true},
            {"lat":47.4826, "lon":-121.74983, "cum_m":5100, "wetted_ft":497.8, "bankfull_ft":646.1, "thalweg_m":149.93, "truncated":true},
            {"lat":47.48536, "lon":-121.75416, "cum_m":5200, "wetted_ft":466.0, "bankfull_ft":667.3, "thalweg_m":147.17, "truncated":true},
            {"lat":47.48846, "lon":-121.75749, "cum_m":5300, "wetted_ft":328.3, "bankfull_ft":381.3, "thalweg_m":147.7, "truncated":true},
            {"lat":47.48905, "lon":-121.75777, "cum_m":5400, "wetted_ft":476.6, "bankfull_ft":529.6, "thalweg_m":149.18, "truncated":true},
            {"lat":47.4946, "lon":-121.76036, "cum_m":5500, "wetted_ft":381.2, "bankfull_ft":444.8, "thalweg_m":141.3, "truncated":true},
            {"lat":47.50285, "lon":-121.76482, "cum_m":5600, "wetted_ft":709.4, "bankfull_ft":910.6, "thalweg_m":132.43, "truncated":true},
            {"lat":47.50975, "lon":-121.76439, "cum_m":5700, "wetted_ft":815.2, "bankfull_ft":836.4, "thalweg_m":128.25, "truncated":true},
            {"lat":47.51214, "lon":-121.76584, "cum_m":5800, "wetted_ft":571.7, "bankfull_ft":804.6, "thalweg_m":127.74, "truncated":true},
            {"lat":47.5167, "lon":-121.77306, "cum_m":5900, "wetted_ft":857.4, "bankfull_ft":963.3, "thalweg_m":125.59, "truncated":true},
            {"lat":47.52057, "lon":-121.77925, "cum_m":6000, "wetted_ft":529.2, "bankfull_ft":973.8, "thalweg_m":124.23, "truncated":true},
            {"lat":47.5239, "lon":-121.78467, "cum_m":6100, "wetted_ft":688.0, "bankfull_ft":698.6, "thalweg_m":122.42, "truncated":false},
            {"lat":47.52396, "lon":-121.78632, "cum_m":6200, "wetted_ft":635.0, "bankfull_ft":751.5, "thalweg_m":122.16, "truncated":false},
            {"lat":47.52432, "lon":-121.79044, "cum_m":6300, "wetted_ft":306.9, "bankfull_ft":613.9, "thalweg_m":125.0, "truncated":true},
            {"lat":47.52676, "lon":-121.80126, "cum_m":6400, "wetted_ft":317.5, "bankfull_ft":317.5, "thalweg_m":122.69, "truncated":true},
            {"lat":47.52666, "lon":-121.80712, "cum_m":6500, "wetted_ft":148.2, "bankfull_ft":179.9, "thalweg_m":123.5, "truncated":false},
            {"lat":47.52917, "lon":-121.81704, "cum_m":6600, "wetted_ft":423.3, "bankfull_ft":994.8, "thalweg_m":124.59, "truncated":true},
            {"lat":47.53507, "lon":-121.82746, "cum_m":6700, "wetted_ft":275.1, "bankfull_ft":359.8, "thalweg_m":121.99, "truncated":false},
            {"lat":47.54, "lon":-121.8353, "cum_m":6800, "wetted_ft":190.5, "bankfull_ft":222.2, "thalweg_m":122.1, "truncated":false},
            {"lat":47.5424, "lon":-121.83815, "cum_m":6900, "wetted_ft":412.6, "bankfull_ft":444.4, "thalweg_m":37.53, "truncated":false},
            {"lat":47.54825, "lon":-121.84349, "cum_m":7000, "wetted_ft":275.1, "bankfull_ft":888.7, "thalweg_m":31.91, "truncated":true},
            {"lat":47.54932, "lon":-121.84556, "cum_m":7100, "wetted_ft":402.0, "bankfull_ft":412.6, "thalweg_m":31.14, "truncated":true},
            {"lat":47.5538, "lon":-121.85954, "cum_m":7200, "wetted_ft":338.5, "bankfull_ft":370.2, "thalweg_m":28.7, "truncated":false},
            {"lat":47.55392, "lon":-121.86441, "cum_m":7300, "wetted_ft":253.9, "bankfull_ft":317.3, "thalweg_m":28.62, "truncated":false},
            {"lat":47.55653, "lon":-121.87853, "cum_m":7400, "wetted_ft":201.0, "bankfull_ft":560.6, "thalweg_m":27.55, "truncated":false},
            {"lat":47.55803, "lon":-121.87762, "cum_m":7500, "wetted_ft":296.2, "bankfull_ft":1089.5, "thalweg_m":28.21, "truncated":true},
            {"lat":47.55851, "lon":-121.87792, "cum_m":7600, "wetted_ft":856.7, "bankfull_ft":856.7, "thalweg_m":28.26, "truncated":true},
            {"lat":47.56871, "lon":-121.88433, "cum_m":7700, "wetted_ft":243.2, "bankfull_ft":275.0, "thalweg_m":24.28, "truncated":false}
        ]
    }

};
