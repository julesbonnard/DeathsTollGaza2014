$(function() {
  //Token pour accès aux data Mapbox
  L.mapbox.accessToken = 'pk.eyJ1IjoianVsZXNiIiwiYSI6InE5UVdRbnMifQ.P0ghMecLUc-lUFHmkTgYtQ';

  //Frontières de la map
  var southWest = L.latLng(30.939550, 33.890193),
    northEast = L.latLng(31.7972695,35.1484705),
    bounds = L.latLngBounds(southWest, northEast);

  // Créer une carte dans la div #map
  var map = L.mapbox.map('map', '', {
    legendControl: {
      position: 'bottomright' //Légende
    },
    shareControl: false, //Boutons de partage
    infoControl: false, //Boutons Info d'attribution
    maxZoom: 16,
    minZoom: 10,
    attributionControl: false, //Footer attribution
    maxBounds: bounds
  }).setView([31.467, 34.37], 11); //Position et zoom de départ

  //Ajout du bouton Plein écran
  L.control.fullscreen().addTo(map);

  //Configuration des calques distants
  var base_layer = L.mapbox.tileLayer('julesb.j41dda2o',
    {zIndex: 10});
  var density_layer = L.mapbox.tileLayer('julesb.1csaif6r', {
    attribution: ' IMEMC | IDF | Palestinian Office of Statistics',
    zIndex: 20
  });
  var limits_layer = L.mapbox.tileLayer('julesb.cxjvpldi', {
    attribution: ' OCHA',
    zIndex: 30
  });
  var poi_layer = L.mapbox.tileLayer('julesb.fqdxi529', {
    attribution: ' OCHA',
    zIndex: 120
  });
  var impacts_layer = L.mapbox.tileLayer('julesb.7sfnipb9', {
    attribution: ' Unitar/Unosat',
    zIndex: 50
  });
  var impacts_gridLayer = L.mapbox.gridLayer('julesb.7sfnipb9', {
    attribution: ' Unitar/Unosat',
    zIndex: 55
  });
  var labels_layer = L.mapbox.tileLayer('julesb.j41971k6',{zIndex: 100});
  var googleLayer = new L.Google('SATELLITE');

  //Ajouts des calques à la base
  map.addLayer(base_layer);
  map.addLayer(density_layer);
  map.addLayer(limits_layer);
  // map.addControl(L.mapbox.gridControl(impacts_gridLayer, {
  //   follow: true //Tooltip suit la souris
  // }));

  //Ajout de l'échelle en haut à gauche
  L.control.scale({
    position: 'bottomleft',
    metric: true,
    imperial: false
  }).addTo(map);

  //Ajout de la minimap en haut à droite
  var minimap = new L.Control.MiniMap(L.mapbox.tileLayer('julesb.j3kccl6o'), {
    position: 'topright'
  });
  map.addControl(minimap);

  //Couleurs des bulles et des colonnes du graph
  var color = {
    fill: {
      palestinian: '#007a3d',
      israelian: '#d95f0e'
    },
    stroke: {
      palestinian: '#ffffff',
      israelian: '#000000'
    }
  };

  //Création des calques interactifs GeoJSON
  var circleLayer = L.geoJson(null, {
      pointToLayer: scaledPoint
    })
    .addTo(map);

  //Déterminer le rayon d'un cercle proportionnel en fonction de la valeur et du rayon minimal
  function pointRadius(value, radMin, varMin) {
    var radMin = radMin || 6;
    var varMin = varMin || 1;
    return (radMin / 2) * Math.sqrt(value / varMin);
  }

  //Ajouter un point et un popup au calque
  function scaledPoint(feature, latlng) {
    return L.circleMarker(latlng, {
      radius: pointRadius(feature.properties.Fatalities),
      fillOpacity: 0.7,
      //weight: 0.5,
      fillColor: color.fill[feature.properties.Side],
      color: color.stroke[feature.properties.Side]

    }).bindPopup(
      '<h2>' + feature.properties.Place + '</h2>' +
      feature.properties.Fatalities + ' deaths');
  }

  //Oganiser les données pour affichage sur la carte
  function summarize_map(data) {
    //Supprimer les lieux inconnus
    data = data.filter(function(d) {
      return d.Place !== "#N/A" && d.Place !== "Unknown";
    });

    //Pivot table par lieu
    var nest = d3.nest()
      .key(function(d) {
        return d.Side;
      })
      .key(function(d) {
        return d.Place;
      })
      .rollup(function(d) {
        return {
          Fatalities: d3.sum(d, function(g) {
            return +g.Fatalities;
          }),
          coordinates: [+d[0].Longitude, +d[0].Latitude],
          Side: d[0].Side
        };
      })
      .entries(data);

    //Générer GeoJSON
    var result = {
      "features": []
    };
    nest.forEach(function(sides, i) {
      sides.values.forEach(function(places, i) {
        result.features.push({
          "id": i,
          "properties": {
            "Place": places.key,
            "Fatalities": places.values.Fatalities,
            "Side": places.values.Side
          },
          "type": "Feature",
          "geometry": {
            "type": "Point",
            "coordinates": places.values.coordinates
          }
        });
      });
    });
    return result;
  }

  // Organiser les données pour affichage sur graphique
  function summarize_chart(data) {
    //Filtrer les lieux inconnus
    data = data.filter(function(d) {
      return d.Date !== "#N/A" && d.Date !== "Unknown";
    });

    //Pivot table par date
    var nest = d3.nest()
      .key(function(d) {
        return d.Date;
      })
      .rollup(function(d) {
        return {
          Fatalities: d3.sum(d, function(g) {
            return +g.Fatalities;
          }),
          Side: d[0].Side
        };
      })
      .entries(data);
    return nest;
  }

  d3.csv('gazaVictimsList.csv', function(err, data) {
    circleLayer.addData(summarize_map(data));
    setBrush(summarize_chart(data), data);
  });

  //Générer le graphique par date
  function setBrush(data, data_original) {

    // Définition du format string des dates
    var format = d3.time.format("%d/%m/%Y");

    // Génération du container et des marges
    var container = d3.select('#brush'),
      margin = {
        top: 10,
        right: 50,
        bottom: 20,
        left: 30
      },
      width = container.node().offsetWidth - margin.left - margin.right,
      height = 100 - margin.top - margin.bottom;

    //Génération de la zone SVG
    var svg = container.append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom);

    //Génération de la zone contenant les colonnes
    var context = svg.append('g')
      .attr('class', 'context')
      .attr('transform', 'translate(' +
        margin.left + ',' +
        margin.top + ')');

    //Extrémités temporelles pour l'axe des abscisses
    var timeExtent = d3.extent(data, function(d) {
      return format.parse(d.key);
    });
    //Domaine de l'axe des abscisses
    var x = d3.time.scale()
      .range([0, width])
      .domain(timeExtent);

    //Domaine de l'axe des ordonnées
    var y = d3.scale.linear()
      .domain([0,
        d3.max(data, function(d) {
          return d.values.Fatalities;
        })
      ])
      .range([height, 0]);

    //Génération des axes
    xAxis = d3.svg.axis()
      .scale(x)
      .ticks(5);

    yAxis = d3.svg.axis()
      .scale(y)
      .ticks(5)
      .orient("left");

    // Détecter la sélection
    var brush = d3.svg.brush()
      .x(x)
      .on('brushend', brushend);

    //Pivot table pour séparer les deux côtés
    var nest = d3.nest()
      .key(function(d) {
        return d.Side;
      })
      .key(function(d) {
        return d.Date;
      })
      .rollup(function(d) {
        return {
          Fatalities: d3.sum(d, function(g) {
            return +g.Fatalities;
          }),
          Side: d[0].Side
        };
      })
      .entries(data_original);

    nest.forEach(function(value, i) {
      // Créer les colonnes
      context.selectAll('rect.bars')
        .data(value.values)
        .enter()
        .append('rect')
        .attr('x', function(d, i) {
          return x(format.parse(d.key));
        })
        .attr('y', function(d) {
            if(d.values.Side=="palestinian") {
              return y(d.values.Fatalities);
            } else {
              return y(d.values.Fatalities) + (height - y(d.values.Fatalities));
            }
        })
        .attr('width', width / data.length)
        .attr('height', function(d) {
            return height - y(d.values.Fatalities);
        })
        .attr('opacity', 0.9)
        .attr('fill', function(d) {
          return color.fill[d.values.Side];
        })
        .attr('stroke', function(d) {
          return color.stroke[d.values.Side];
        })
        .attr('stroke-width', 0);
    });

    // Style du rectangle de séleciton
    context.append('g')
      .attr('class', 'x brush')
      .call(brush)
      .selectAll('rect')
      .attr('y', 0)
      .attr('height', height);

    //Affichage des axes
    context.append('g')
      .attr('class', 'x axis')
      .attr('transform', 'translate(' + width / data.length / 2 + ',' + (height) + ')')
      .call(xAxis);

    context.append('g')
      .attr('class', 'y axis')
    //.attr('transform', 'translate(0,0)')
    .call(yAxis)
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", 6)
      .attr("dy", ".71em")
      .style("text-anchor", "end")
      .text("Fatalities");

    //Filtre après sélection
    function brushend() {
      var filter;
      // If the user has selected no brush area, share everything.
      if (brush.empty()) {
        filter = function() {
          return true;
        }
      } else {
        // Otherwise, restrict features to only things in the brush extent.
        filter = function(feature) {
          return format.parse(feature.Date) >= format.parse(format(brush.extent()[0])) &&
            format.parse(feature.Date) <= format.parse(format(brush.extent()[1]));
        };
      }
      var filtered = data_original.filter(filter);
      circleLayer.clearLayers()
        .addData(summarize_map(filtered));
    }
  }

  //Réorganiser les layers lors du zoom 
  function setLayers(active, inactive) {
    inactive.forEach(function(value, i) {
      if (map.hasLayer(value)) {
        map.removeLayer(value);
      }
    });
    active.forEach(function(value, i) {
      if (map.hasLayer(value) == false) {
          map.addLayer(value);
      }
    });
  }

  //Détecter le zoom et sélectionner les bons calques
  map.on('zoomend', function(d) {
    var zoom = d.target._animateToZoom;
    switch (zoom) {
      case 10:
        setLayers([base_layer, density_layer, limits_layer, labels_layer, circleLayer], [googleLayer, poi_layer, impacts_layer]);
        break;
      case 11:
        setLayers([base_layer, density_layer, limits_layer, circleLayer], [googleLayer, poi_layer, impacts_layer, labels_layer]);
        break;
      case 12:
        setLayers([base_layer, density_layer, limits_layer, circleLayer, labels_layer], [googleLayer, poi_layer, impacts_layer]);
        break;
      case 13:
        setLayers([base_layer, density_layer, poi_layer, circleLayer, labels_layer], [googleLayer, impacts_layer, limits_layer]);
        break;
      case 14:
        setLayers([base_layer, poi_layer, impacts_layer, labels_layer], [googleLayer, density_layer, limits_layer, circleLayer]);
        break;
      case 15:
        setLayers([googleLayer, poi_layer, impacts_layer, labels_layer], [base_layer, density_layer, limits_layer, circleLayer]);
        break;
      case 16:
        setLayers([googleLayer, poi_layer, impacts_layer], [base_layer, density_layer, limits_layer, circleLayer, labels_layer]);
        break;
      default:
        break;
    }
  });

  map.gridControl.options.follow = true;
  map.legendControl.addLegend($('#legend').html());
  map.legendControl.addLegend($('#source_legend').html());
});