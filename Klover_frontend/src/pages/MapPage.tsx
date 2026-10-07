import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { api, ApiError, num } from "../api/client";
import { useAsync, useSecondsTick } from "../hooks/useAsync";
import { Link } from "react-router-dom";
import { Icon, useToast } from "../components/ui";
import { formatClock, formatWhenUtc } from "../lib/format";
import { countdownTo, nextRunPerZone } from "./ZonesPage";
import { initialBox } from "../lib/overlayLayer";
import type {
  Address,
  MapOverlay,
  OverlayShape,
  PolygonGeometry,
  Settings,
  Sprinkler,
  Zone,
} from "../api/types";
import "./MapPage.css";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

const ESRI = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution:
    'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics',
  maxNativeZoom: 18,
  probeCoverage: true,
};

const MAPBOX = {
  url: `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${MAPBOX_TOKEN}`,
  attribution:
    '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.maxar.com/">Maxar</a>',
  maxNativeZoom: 21,
  probeCoverage: false,
};

const SATELLITE = MAPBOX_TOKEN ? MAPBOX : ESRI;

type Basemap = "satellite" | "drone";


const DEEPEST_PROBE = 20;
const SHALLOWEST_PROBE = 16;

async function deepestImageryZoom(
  lat: number,
  lon: number,
  signal: AbortSignal,
): Promise<number> {
  for (let z = DEEPEST_PROBE; z > SHALLOWEST_PROBE; z--) {
    const n = 2 ** z;
    const x = Math.floor(((lon + 180) / 360) * n);
    const y = Math.floor(
      ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n,
    );
    try {
      const response = await fetch(
        `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tilemap/${z}/${y}/${x}/1/1`,
        { signal },
      );
      if (!response.ok) continue;
      const body = (await response.json()) as { data?: number[] };
      if (body.data?.[0] === 1) return z;
    } catch {
      if (signal.aborted) throw new Error("aborted");
    }
  }
  return SHALLOWEST_PROBE;
}

const FALLBACK_VIEW: { center: [number, number]; zoom: number } = {
  center: [46.76667, 23.6],
  zoom: 17,
};

const MAP_GESTURES = "mousedown touchstart pointerdown dblclick wheel contextmenu";

function useControlLayer() {
  return useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    L.DomEvent.on(node, MAP_GESTURES, L.DomEvent.stopPropagation);
  }, []);
}

export function MapPage() {
  const toast = useToast();
  const zones = useAsync(() => api.zones(), [], { intervalMs: 5_000 });
  const schedules = useAsync(() => api.schedules(), [], { intervalMs: 30_000 });
  const settings = useAsync(() => api.settings(), []);
  const overlays = useAsync(() => api.overlays(), [], { intervalMs: 60_000 });

  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  /** Rendered polygons and their labels, keyed by zone id. */
  const shapesRef = useRef(new Map<string, { polygon: L.Polygon; label: L.Marker }>());
  const sprinklersRef = useRef<L.Marker[]>([]);
  const fittedRef = useRef(false);

  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "draw" | "edit" | "sprinkler">("idle");
  const [drawTargetId, setDrawTargetId] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Address[]>([]);
  const [searching, setSearching] = useState(false);
  const [scale, setScale] = useState<{ label: string; width: number }>({
    label: "5 m",
    width: 60,
  });
  const controlRef = useControlLayer();
  const [nativeZoom, setNativeZoom] = useState(18);
  /** Set below; held in a ref so the map's resize observer can call it. */
  const refitDroneRef = useRef<() => void>(() => {});

  const fileRef = useRef<HTMLInputElement | null>(null);
  const droneLayerRef = useRef<L.ImageOverlay | null>(null);
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  /** The rail collapses to just its header; remembered per browser. */
  const [railOpen, setRailOpen] = useState(() => {
    try {
      return localStorage.getItem("klover.map.rail") !== "closed";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("klover.map.rail", railOpen ? "open" : "closed");
    } catch {
      /* private browsing; the preference simply is not remembered */
    }
  }, [railOpen]);

  const list = useMemo(() => zones.data ?? [], [zones.data]);
  const nextRuns = useMemo(() => nextRunPerZone(schedules.data ?? []), [schedules.data]);
  const tick = useSecondsTick(true);

  const reloadOverlays = overlays.reload;
  const overlayList = useMemo(() => overlays.data ?? [], [overlays.data]);
  const activeOverlay =
    overlayList.find((item) => item.id === activeOverlayId) ?? overlayList[0] ?? null;

  const droneView = basemap === "drone" && !!activeOverlay;
  const overlayShapes = useAsync(
    () => (activeOverlay ? api.overlayShapes(activeOverlay.id) : Promise.resolve([])),
    [activeOverlay?.id],
  );
  const reloadOverlayShapes = overlayShapes.reload;
  const droneShapes = useMemo(() => {
    const map = new Map<string, OverlayShape>();
    for (const shape of overlayShapes.data ?? []) map.set(shape.zone_id, shape);
    return map;
  }, [overlayShapes.data]);

  const shapeOf = useCallback(
    (zone: Zone): { geometry: PolygonGeometry | null; sprinklers: Sprinkler[] } => {
      if (!droneView) return { geometry: zone.geometry, sprinklers: zone.sprinklers ?? [] };
      const shape = droneShapes.get(zone.id);
      return { geometry: shape?.geometry ?? null, sprinklers: shape?.sprinklers ?? [] };
    },
    [droneView, droneShapes],
  );

  const drawn = list.filter((zone) => shapeOf(zone).geometry);

  /*
   * Zone rows refresh every few seconds so the rail can show live watering,
   * which changes `list`'s identity on every poll. Rebuilding the Leaflet
   * layers that often would tear polygons out from under an edit in progress,
   * so the map redraws only when something it actually draws has changed.
   */
  const mapSignature = useMemo(
    () =>
      JSON.stringify(
        list.map((zone) => [
          zone.id,
          zone.name,
          zone.color,
          zone.enabled,
          zone.flow_rate_lpm,
          zone.geometry,
          zone.sprinklers,
        ]),
      ),
    [list],
  );
  const listRef = useRef(list);
  listRef.current = list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mapZones = useMemo(() => listRef.current, [mapSignature]);

  /* -- Persist a drawn or edited polygon --------------------------- */
  const reloadZones = zones.reload;
  /**
   * Persists a boundary. Autosaves during an edit pass stay quiet and skip the
   * reload, because refetching would rebuild the layers under the user's cursor.
   */
  const saveGeometry = useCallback(
    async (
      zone: Zone,
      geometry: PolygonGeometry | null,
      options: { silent?: boolean; reload?: boolean } = {},
    ) => {
      const { silent = false, reload = true } = options;
      try {
        // The boundary is written to whichever surface it was drawn on.
        if (droneView && activeOverlay)
          await api.saveOverlayShape(activeOverlay.id, zone.id, { geometry });
        else
          await api.updateZone(zone.id, {
            name: zone.name,
            flowRateLpm: num(zone.flow_rate_lpm),
            geometry,
          });
        if (!silent)
          toast(
            geometry
              ? `${zone.name} boundary saved${droneView ? " on this image" : ""}.`
              : `${zone.name} boundary cleared.`,
          );
      } catch (cause) {
        toast(
          cause instanceof ApiError ? cause.message : "Could not save the boundary.",
          "error",
        );
      } finally {
        if (reload) {
          if (droneView) reloadOverlayShapes();
          else reloadZones();
        }
      }
    },
    [toast, reloadZones, reloadOverlayShapes, droneView, activeOverlay],
  );

  /** Persists a zone's sprinkler points. */
  const saveSprinklers = useCallback(
    async (zone: Zone, sprinklers: Sprinkler[], message: string) => {
      try {
        if (droneView && activeOverlay)
          await api.saveOverlayShape(activeOverlay.id, zone.id, { sprinklers });
        else
          await api.updateZone(zone.id, {
            name: zone.name,
            flowRateLpm: num(zone.flow_rate_lpm),
            sprinklers,
          });
        toast(message);
      } catch (cause) {
        toast(
          cause instanceof ApiError ? cause.message : "Could not save the sprinkler.",
          "error",
        );
      } finally {
        if (droneView) reloadOverlayShapes();
        else reloadZones();
      }
    },
    [toast, reloadZones, reloadOverlayShapes, droneView, activeOverlay],
  );

  /*
   * Layer handlers are installed once per zone, so they read the latest
   * callbacks and mode through refs rather than being torn down and rebuilt.
   */
  const saveGeometryRef = useRef(saveGeometry);
  saveGeometryRef.current = saveGeometry;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const saveSprinklersRef = useRef(saveSprinklers);
  saveSprinklersRef.current = saveSprinklers;
  const shapeOfRef = useRef(shapeOf);
  shapeOfRef.current = shapeOf;

  /* -- Map bootstrap ------------------------------------------------ */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: FALLBACK_VIEW.center,
      zoom: FALLBACK_VIEW.zoom,
      zoomControl: false,
      attributionControl: true,
      /*
       * Fractional zoom lets fitBounds match the drone photo to the frame
       * exactly; snapping to whole levels overshoots and crops its edges.
       * The buttons still step a full level at a time.
       */
      zoomSnap: 0,
      zoomDelta: 1,
    });

    tileRef.current = L.tileLayer(SATELLITE.url, {
      attribution: SATELLITE.attribution,
      maxZoom: 22,
      maxNativeZoom: SATELLITE.maxNativeZoom,
    }).addTo(map);

    map.pm.setGlobalOptions({
      allowSelfIntersection: false,
      snappable: true,
      templineStyle: { color: "#a9d138", weight: 3 },
      hintlineStyle: { color: "#a9d138", weight: 3, dashArray: "6,6" },
    });

    const updateScale = () => {
      // Metres represented by 60 screen pixels at the current centre latitude.
      const centre = map.getCenter();
      const metres = map.distance(
        centre,
        map.containerPointToLatLng(map.latLngToContainerPoint(centre).add([60, 0])),
      );
      const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((v) => v >= metres) ?? 2000;
      setScale({
        label: nice >= 1000 ? `${nice / 1000} km` : `${nice} m`,
        width: Math.max(36, Math.min(120, (nice / metres) * 60)),
      });
    };
    updateScale();
    map.on("move zoom", updateScale);

    /*
     * Leaflet measures the container once and caches it. React mounts this
     * before the grid has laid out, so the map can start life believing it is
     * zero pixels wide - which silently breaks zooming and leaves tiles unfilled.
     * Watching the element keeps the cached size honest.
     */
    const resize = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      refitDroneRef.current();
    });
    resize.observe(container);
    map.invalidateSize({ animate: false });

    mapRef.current = map;
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      shapesRef.current.clear();
      sprinklersRef.current = [];
    };
  }, []);

  /*
   * Re-probe imagery depth whenever the view settles somewhere new. Satellite
   * only: the street basemap has uniform worldwide coverage.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || basemap !== "satellite" || !SATELLITE.probeCoverage) return;
    let controller = new AbortController();
    let timer: number | undefined;

    const probe = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        controller.abort();
        controller = new AbortController();
        const centre = map.getCenter();
        deepestImageryZoom(centre.lat, centre.lng, controller.signal)
          .then(setNativeZoom)
          .catch(() => {
            /* superseded by a newer probe, or the service is unreachable */
          });
      }, 400);
    };

    probe();
    map.on("moveend", probe);
    return () => {
      map.off("moveend", probe);
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [basemap]);

  /* -- Apply the probed depth to the tile layer ---------------------- */
  useEffect(() => {
    const layer = tileRef.current;
    if (!layer || basemap !== "satellite" || !SATELLITE.probeCoverage) return;
    if (layer.options.maxNativeZoom === nativeZoom) return;
    layer.options.maxNativeZoom = nativeZoom;
    layer.redraw();
  }, [nativeZoom, basemap]);

  /* -- Switching between the aerial tiles and the drone photo --------- */
  useEffect(() => {
    const map = mapRef.current;
    const tiles = tileRef.current;
    if (!map || !tiles) return;
    // The photo replaces the tiles entirely rather than sitting on top of them.
    if (basemap === "drone") {
      if (map.hasLayer(tiles)) tiles.remove();
    } else if (!map.hasLayer(tiles)) {
      tiles.addTo(map);
    }
  }, [basemap]);

  /* -- Open on the saved garden location ----------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    const place = settings.data as Settings | null;
    if (!map || fittedRef.current || !place) return;
    if (place.latitude != null && place.longitude != null) {
      map.setView([place.latitude, place.longitude], 17);
      fittedRef.current = true;
    }
  }, [settings.data]);

  /* -- Render zone polygons, labels and sprinklers -------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const { polygon, label } of shapesRef.current.values()) {
      polygon.remove();
      label.remove();
    }
    shapesRef.current.clear();
    for (const marker of sprinklersRef.current) marker.remove();
    sprinklersRef.current = [];

    for (const zone of mapZones) {
      const { geometry, sprinklers } = shapeOf(zone);
      if (!geometry) continue;
      const colour = zone.enabled ? zone.color : "#94a3b8";
      const latlngs = ringsToLatLngs(geometry);
      if (!latlngs.length) continue;

      const polygon = L.polygon(latlngs, {
        color: colour,
        weight: 3,
        fillColor: colour,
        fillOpacity: 0.22,
      }).addTo(map);
      polygon.on("click", () => setSelectedId(zone.id));

      // Geoman writes edits back through the same handler as drawing.
      // Geoman only emits pm:update when the edit pass ends, so vertex moves are
      // also autosaved as they happen; a short debounce coalesces a drag.
      let pending: number | undefined;
      polygon.on("pm:edit", () => {
        window.clearTimeout(pending);
        pending = window.setTimeout(() => {
          const geometry = layerToPolygon(polygon);
          if (geometry)
            void saveGeometryRef.current(zone, geometry, { silent: true, reload: false });
        }, 700);
      });
      polygon.on("pm:update", () => {
        window.clearTimeout(pending);
        const geometry = layerToPolygon(polygon);
        if (geometry) void saveGeometryRef.current(zone, geometry);
      });
      polygon.on("remove", () => window.clearTimeout(pending));

      const label = L.marker(polygon.getBounds().getCenter(), {
        interactive: true,
        icon: L.divIcon({
          className: "gmap-label",
          html: `<span class="gmap-label__inner" style="border-color:${colour}">
                   <span class="gmap-label__icon" style="background:${colour}33;color:${colour}">
                     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                       <path d="M20 4c0 8-5.2 12-11 12a5 5 0 0 1 0-10c4.4 0 6.6-1 11-2Z"/>
                       <path d="M4 20c2-4.5 5-7 9-8.6"/>
                     </svg>
                   </span>
                   <span>
                     <span class="gmap-label__name">${escapeHtml(zone.name)}</span>
                     <span class="gmap-label__flow">${num(zone.flow_rate_lpm)} L/min</span>
                   </span>
                 </span>`,
          iconSize: [0, 0],
        }),
      }).addTo(map);
      label.on("click", () => setSelectedId(zone.id));

      shapesRef.current.set(zone.id, { polygon, label });

      const placing = modeRef.current === "sprinkler";
      for (const sprinkler of sprinklers) {
        const marker = L.marker([sprinkler.lat, sprinkler.lng], {
          interactive: placing,
          draggable: placing,
          title: placing ? `Drag to move, click to remove` : undefined,
          icon: L.divIcon({
              className: "gmap-sprinkler",
              html: `<span class="gmap-sprinkler__inner" style="border-color:${colour};color:${colour}">
                       <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                         <path d="M12 12.5V21M8.5 21h7"/><circle cx="12" cy="10.6" r="2.1"/>
                         <path d="M6 8.4c1.4-1.6 3.6-2.6 6-2.6s4.6 1 6 2.6"/>
                       </svg>
                     </span>`,
            iconSize: [0, 0],
          }),
        }).addTo(map);

        if (placing) {
          const others = () =>
            shapeOfRef.current(zone).sprinklers.filter((item) => item.id !== sprinkler.id);
          marker.on("dragend", () => {
            const { lat, lng } = marker.getLatLng();
            void saveSprinklersRef.current(
              zone,
              [...others(), { id: sprinkler.id, lat, lng }],
              `Sprinkler moved on ${zone.name}.`,
            );
          });
          marker.on("click", (event) => {
            L.DomEvent.stop(event);
            void saveSprinklersRef.current(
              zone,
              others(),
              `Sprinkler removed from ${zone.name}.`,
            );
          });
        }

        sprinklersRef.current.push(marker);
      }
    }

    // Frame all drawn zones the first time they arrive - but never in drone
    // view, where leaving the photo's footprint shows empty space.
    if (!fittedRef.current && shapesRef.current.size && basemap !== "drone") {
      const group = L.featureGroup([...shapesRef.current.values()].map((s) => s.polygon));
      map.fitBounds(group.getBounds(), { padding: [56, 56], maxZoom: 19 });
      fittedRef.current = true;
    }

    // Re-arm editing on the freshly created layers if the user is in edit mode.
    if (modeRef.current === "edit")
      for (const { polygon } of shapesRef.current.values())
        polygon.pm.enable({ allowSelfIntersection: false });
    // `mode` is a dependency because sprinkler markers are only interactive
    // while they are being placed.
  }, [mapZones, mode, basemap, shapeOf]);

  /* -- Highlight the selected polygon without rebuilding layers ---------- */
  useEffect(() => {
    for (const [id, { polygon }] of shapesRef.current)
      polygon.setStyle({ fillOpacity: id === selectedId ? 0.36 : 0.22 });
  }, [selectedId, mapZones]);

  /* -- Turn Geoman editing on or off across every polygon ---------------- */
  useEffect(() => {
    for (const { polygon } of shapesRef.current.values()) {
      if (mode === "edit") polygon.pm.enable({ allowSelfIntersection: false });
      else polygon.pm.disable();
    }
  }, [mode, mapZones]);

  /* -- Drone imagery ------------------------------------------------------ */
  /*
   * The photo behaves as a basemap: it is pinned to the ground bounds recorded
   * when it was added, and selecting it frames those bounds so the picture fills
   * the map area. Zones keep their real coordinates, so everything drawn on the
   * photo stays valid on the satellite view too.
   */
  const droneBounds = useMemo(
    () =>
      activeOverlay
        ? L.latLngBounds(
            L.latLng(activeOverlay.south, activeOverlay.west),
            L.latLng(activeOverlay.north, activeOverlay.east),
          )
        : null,
    [activeOverlay],
  );

  /** Zero padding, so the photo's edges meet the frame's edges exactly. */
  const refitDrone = useCallback(() => {
    const map = mapRef.current;
    if (!map || basemap !== "drone" || !droneBounds) return;
    map.fitBounds(droneBounds, { padding: [0, 0], animate: false });
  }, [basemap, droneBounds]);
  refitDroneRef.current = refitDrone;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = droneLayerRef.current;

    if (basemap !== "drone" || !activeOverlay || !droneBounds) {
      if (layer) {
        layer.remove();
        droneLayerRef.current = null;
      }
      return;
    }

    if (layer) layer.remove();

    const image = L.imageOverlay(
      api.overlayImageUrl(activeOverlay.asset_token),
      droneBounds,
      { className: "gmap-overlay-image", interactive: false, zIndex: 1 },
    ).addTo(map);
    droneLayerRef.current = image;
    // Keeps panning and zooming within the photograph.
    map.setMaxBounds(droneBounds.pad(0.08));
    refitDrone();

    return () => {
      map.setMaxBounds(undefined as unknown as L.LatLngBoundsExpression);
    };
  }, [basemap, activeOverlay, droneBounds, refitDrone]);

  /** Frames the photo so it fills the map area. */
  function showDrone(id?: string) {
    const overlay = id ? overlayList.find((item) => item.id === id) : activeOverlay;
    if (!overlay) return;
    if (id) setActiveOverlayId(id);
    setBasemap("drone");
  }

  async function onPickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const map = mapRef.current;
    if (!file || !map) return;

    setUploading(true);
    try {
      const box = initialBox(map);
      const created = await api.uploadOverlay(
        file,
        box,
        file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Drone image",
      );
      toast(`${created.name} added.`);
      setActiveOverlayId(created.id);
      setBasemap("drone");
      reloadOverlays();
    } catch (cause) {
      toast(
        cause instanceof ApiError ? cause.message : "That image could not be added.",
        "error",
      );
    } finally {
      setUploading(false);
    }
  }

  async function removeOverlay(overlay: MapOverlay) {
    try {
      await api.deleteOverlay(overlay.id);
      if (activeOverlay?.id === overlay.id) {
        setActiveOverlayId(null);
        setBasemap("satellite");
      }
      toast(`${overlay.name} removed.`);
      reloadOverlays();
    } catch (cause) {
      toast(
        cause instanceof ApiError ? cause.message : "Could not remove the image.",
        "error",
      );
    }
  }

  /* -- Placing sprinklers ------------------------------------------------ */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== "sprinkler") return;
    const onClick = (event: L.LeafletMouseEvent) => {
      const zone = list.find((item) => item.id === selectedId);
      if (!zone) return;
      void saveSprinklers(
        zone,
        [
          ...shapeOf(zone).sprinklers,
          {
            id: crypto.randomUUID(),
            lat: event.latlng.lat,
            lng: event.latlng.lng,
          },
        ],
        `Sprinkler added to ${zone.name}.`,
      );
    };
    map.on("click", onClick);
    map.getContainer().style.cursor = "crosshair";
    return () => {
      map.off("click", onClick);
      map.getContainer().style.cursor = "";
    };
  }, [mode, list, selectedId, saveSprinklers, shapeOf]);

  /* -- Drawing a boundary for one zone --------------------------------- */
  function startDrawing(zone: Zone, replacing = false) {
    const map = mapRef.current;
    if (!map) return;
    setSelectedId(zone.id);
    setDrawTargetId(zone.id);
    setMode("draw");
    setHint(
      replacing
        ? `Click point by point around ${zone.name} to re-trace it here. Click the first point to close the shape.`
        : `Click point by point around ${zone.name}, then click the first point to close the shape.`,
    );
    map.pm.enableDraw("Polygon");
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onCreate = (event: { layer: L.Layer }) => {
      const layer = event.layer as L.Polygon;
      const geometry = layerToPolygon(layer);
      layer.remove();
      map.pm.disableDraw();
      setMode("idle");
      setHint(null);
      const zone = list.find((z) => z.id === drawTargetId);
      setDrawTargetId(null);
      if (zone && geometry) void saveGeometry(zone, geometry);
    };
    map.on("pm:create", onCreate);
    return () => {
      map.off("pm:create", onCreate);
    };
  }, [drawTargetId, list, saveGeometry]);

  function cancelDrawing() {
    mapRef.current?.pm.disableDraw();
    setMode("idle");
    setDrawTargetId(null);
    setHint(null);
  }

  function toggleEditing() {
    if (!mapRef.current) return;
    if (mode === "edit") {
      setMode("idle");
      setHint(null);
      return;
    }
    mapRef.current.pm.disableDraw();
    setDrawTargetId(null);
    setMode("edit");
    setHint("Drag the white handles to reshape a boundary. Changes save automatically.");
  }

  function toggleSprinklers() {
    const map = mapRef.current;
    if (!map) return;
    if (mode === "sprinkler") {
      setMode("idle");
      setHint(null);
      return;
    }
    map.pm.disableDraw();
    setDrawTargetId(null);
    setMode("sprinkler");
    const zone = list.find((item) => item.id === selectedId);
    setHint(
      zone
        ? `Click the map to add a sprinkler to ${zone.name}. Drag one to move it, click it to remove it.`
        : "Choose a zone in the list first, then click the map to place its sprinklers.",
    );
  }

  /*
   * Leaflet's animated zoom finishes on a `transitionend`; if the browser never
   * delivers one the map stays flagged as animating and ignores later zooms.
   * The buttons therefore move the view directly rather than animating.
   */
  function stepZoom(delta: number) {
    const map = mapRef.current;
    if (!map) return;
    const next = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), map.getZoom() + delta));
    if (next !== map.getZoom()) map.setView(map.getCenter(), next, { animate: false });
  }

  function focusZone(zone: Zone) {
    setSelectedId(zone.id);
    const shape = shapesRef.current.get(zone.id);
    // Untraced in this view: offer to draw it here rather than jumping the map
    // to a shape that belongs to the other one.
    if (!shape) {
      startDrawing(zone, true);
      return;
    }
    if (modeRef.current === "sprinkler")
      setHint(
        `Click the map to add a sprinkler to ${zone.name}. Drag one to move it, click it to remove it.`,
      );
    if (shape && mapRef.current)
      mapRef.current.fitBounds(shape.polygon.getBounds(), {
        padding: [70, 70],
        maxZoom: 20,
      });
  }

  /*
   * The bar shows whatever the current tool is asking for, falling back to the
   * standing instructions. Dismissing hides it until the tool changes.
   */
  const baseHint =
    "Click a zone to trace or focus it. Drag a shape's handles to edit. Add sprinklers with the tool.";
  const hintText = hintDismissed ? null : (hint ?? baseHint);

  useEffect(() => setHintDismissed(false), [mode, hint]);

  /* -- Minimap viewport ---------------------------------------------- */
  const miniRef = useRef<HTMLDivElement | null>(null);
  const [miniView, setMiniView] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || basemap !== "drone" || !droneBounds) {
      setMiniView(null);
      return;
    }
    /** Where the visible area sits inside the photo, as percentages. */
    const update = () => {
      const view = map.getBounds();
      const imgW = droneBounds.getEast() - droneBounds.getWest();
      const imgH = droneBounds.getNorth() - droneBounds.getSouth();
      if (imgW <= 0 || imgH <= 0) return;
      const clamp = (v: number) => Math.max(0, Math.min(100, v));
      const left = clamp(((view.getWest() - droneBounds.getWest()) / imgW) * 100);
      const right = clamp(((view.getEast() - droneBounds.getWest()) / imgW) * 100);
      const top = clamp(((droneBounds.getNorth() - view.getNorth()) / imgH) * 100);
      const bottom = clamp(((droneBounds.getNorth() - view.getSouth()) / imgH) * 100);
      setMiniView({ left, top, width: Math.max(2, right - left), height: Math.max(2, bottom - top) });
    };
    update();
    map.on("move zoom", update);
    return () => {
      map.off("move zoom", update);
    };
  }, [basemap, droneBounds]);

  /*
   * The rail is bottom-anchored above the minimap, whose height depends on the
   * photo's proportions, so it is measured rather than guessed.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const mini = miniRef.current;
    if (!mini) {
      root.style.setProperty("--gm-mini-h", "0px");
      return;
    }
    const observer = new ResizeObserver(() =>
      root.style.setProperty("--gm-mini-h", `${Math.round(mini.offsetHeight)}px`),
    );
    observer.observe(mini);
    root.style.setProperty("--gm-mini-h", `${Math.round(mini.offsetHeight)}px`);
    return () => observer.disconnect();
  }, [basemap, activeOverlay, miniView !== null]);

  /* -- Address search --------------------------------------------------- */
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    // Nominatim asks for roughly one request per second.
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const found = await api.geocodeAddress(trimmed, controller.signal);
        setResults(found.results);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 700);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  function goToAddress(address: Address) {
    mapRef.current?.setView([address.latitude, address.longitude], address.zoom);
    fittedRef.current = true;
    setQuery("");
    setResults([]);
  }

  return (
    <div className="gmap" ref={rootRef}>
      <div ref={containerRef} className="gmap__canvas" />

      {/* Basemap switch, address search, and the drone exit action */}
      <div ref={controlRef} className="gmap__topbar">
        <div className="gpanel gswitch" role="group" aria-label="Basemap">
          <button
            type="button"
            aria-pressed={basemap === "satellite"}
            onClick={() => setBasemap("satellite")}
          >
            Satellite
          </button>
          <button
            type="button"
            aria-pressed={basemap === "drone"}
            disabled={!activeOverlay}
            title={activeOverlay ? `Show ${activeOverlay.name}` : "Add a drone image first"}
            onClick={() => showDrone()}
          >
            Drone
          </button>
        </div>

        <div className="gsearch">
          <div className="gpanel gsearch__field">
            <Icon name="search" size={17} style={{ color: "var(--gm-faint)" }} />
            <input
              value={query}
              placeholder="Find your address…"
              aria-label="Find your address"
              onChange={(event) => setQuery(event.target.value)}
            />
            {searching ? <span className="btn__spinner" style={{ color: "#8ea89b" }} /> : null}
          </div>
          {results.length > 0 ? (
            <div className="gpanel gsearch__results">
              {results.map((address) => (
                <button key={address.id} type="button" onClick={() => goToAddress(address)}>
                  {address.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="gmap__topright">
          {basemap === "drone" ? (
            <button
              type="button"
              className="gaction"
              onClick={() => setBasemap("satellite")}
            >
              <Icon name="close" size={17} />
              Exit drone view
            </button>
          ) : null}
        </div>
      </div>

      {/* Zones, tools and imagery */}
      <aside ref={controlRef} className="gmap__rail" data-open={railOpen}>
        <section className="gpanel gzones">
          <header className="gzones__head">
            <button
              type="button"
              className="gcollapse"
              aria-expanded={railOpen}
              aria-label={railOpen ? "Collapse the panel" : "Expand the panel"}
              title={railOpen ? "Collapse the panel" : "Expand the panel"}
              onClick={() => setRailOpen((open) => !open)}
            >
              <Icon name={railOpen ? "chevron-down" : "chevron-right"} size={17} />
            </button>
            <h2 className="gzones__title">Irrigation zones</h2>
            {railOpen ? (
              <Link to="/zones" className="gadd">
                <Icon name="plus" size={16} strokeWidth={2.3} />
                Add zone
              </Link>
            ) : (
              <span className="gzones__count">{list.length}</span>
            )}
          </header>

          {!railOpen ? null : zones.initial ? (
            <p className="gzones__empty">Loading zones…</p>
          ) : list.length === 0 ? (
            <p className="gzones__empty">
              No zones yet. Add one on the Zones screen, then trace it here.
            </p>
          ) : (
            list.map((zone) => {
              const next = nextRuns.get(zone.id) ?? null;
              const { geometry, sprinklers } = shapeOf(zone);
              const watering = !!zone.active_run_id;
              const nozzles = sprinklers.length;
              return (
                <button
                  key={zone.id}
                  type="button"
                  className="gzone"
                  data-selected={zone.id === selectedId}
                  onClick={() => (geometry ? focusZone(zone) : startDrawing(zone))}
                >
                  <span className="gzone__head">
                    <span
                      className="gzone__dot"
                      data-live={watering}
                      style={{ background: zone.enabled ? zone.color : "#7b8a83" }}
                    />
                    <span className="gzone__name">{zone.name}</span>
                    <span
                      className="gzone__pill"
                      data-tone={watering ? "live" : zone.enabled ? "on" : "off"}
                    >
                      {watering ? "Watering" : zone.enabled ? "Active" : "Paused"}
                    </span>
                    <Icon name="chevron-right" size={15} className="gzone__chevron" />
                  </span>

                  <span className="gzone__body">
                    <span className="gzone__when">
                      {watering ? (
                        <b>{remainingLabel(zone, tick)} left</b>
                      ) : next ? (
                        <>
                          <b>{countdownTo(next)}</b> · {formatWhenUtc(next)}
                        </>
                      ) : (
                        "No schedule"
                      )}
                    </span>
                    <span className="gzone__meta">
                      {num(zone.flow_rate_lpm)} L/min
                      {nozzles ? ` · ${nozzles} sprinkler${nozzles === 1 ? "" : "s"}` : ""}
                      {zone.description ? ` · ${zone.description}` : ""}
                    </span>
                  </span>

                  {!geometry ? (
                    <span className="gzone__todo">
                      <Icon name="pencil" size={11} />
                      Not traced {droneView ? "on this image" : "here"} — click to draw
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </section>

        {railOpen ? (
        <section className="gpanel gtools">
          <header className="gtools__head">
            <span className="gtools__title">Drawing tools</span>
            <span className="gtools__scope">
              {droneView ? activeOverlay?.name : "Satellite"}
            </span>
          </header>

          <div className="gtools__grid">
            {mode === "draw" ? (
              <button
                type="button"
                className="gtool gtool--wide gtool--cancel"
                onClick={cancelDrawing}
              >
                <Icon name="close" size={15} />
                Cancel drawing
              </button>
            ) : null}
            <button
              type="button"
              className="gtool"
              aria-pressed={mode === "edit"}
              disabled={drawn.length === 0}
              title={
                drawn.length ? "Drag the handles to reshape" : "Trace a zone first"
              }
              onClick={toggleEditing}
            >
              <Icon name="pencil" size={15} />
              {mode === "edit" ? "Done editing" : "Edit shapes"}
            </button>
            <button
              type="button"
              className="gtool"
              disabled={!selectedId}
              title={
                selectedId ? "Draw a new outline for the selected zone" : "Select a zone first"
              }
              onClick={() => {
                const zone = list.find((item) => item.id === selectedId);
                if (zone) startDrawing(zone, !!shapeOf(zone).geometry);
              }}
            >
              <Icon name="pencil" size={15} />
              Re-trace
            </button>
            <button
              type="button"
              className="gtool gtool--wide"
              aria-pressed={mode === "sprinkler"}
              disabled={list.length === 0}
              onClick={toggleSprinklers}
            >
              <Icon name="sprinkler" size={15} />
              {mode === "sprinkler" ? "Done placing sprinklers" : "Place sprinklers"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => void onPickImage(event)}
            />
            <button
              type="button"
              className="gtool gtool--wide"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="drone" size={15} />
              {uploading ? "Adding image…" : "Add image from drone"}
            </button>
          </div>
        </section>
        ) : null}

        {railOpen && overlayList.length ? (
          <section className="gpanel gimages">
            {overlayList.map((overlay) => {
              const showing = basemap === "drone" && activeOverlay?.id === overlay.id;
              return (
                <div key={overlay.id} className="gimage" data-active={showing}>
                  <img
                    className="gimage__thumb"
                    src={api.overlayImageUrl(overlay.asset_token)}
                    alt=""
                  />
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: 0,
                      background: "transparent",
                      textAlign: "left",
                      cursor: "pointer",
                      padding: 0,
                    }}
                    onClick={() => (showing ? setBasemap("satellite") : showDrone(overlay.id))}
                  >
                    <span className="gimage__name">{overlay.name}</span>
                    <span className="gimage__meta">
                      {showing ? "Showing" : "Tap to show"} ·{" "}
                      {Math.round(Number(overlay.byte_size) / 1024)} KB
                    </span>
                  </button>
                  <button
                    type="button"
                    className="gimage__icon"
                    aria-label={`Remove ${overlay.name}`}
                    title="Remove"
                    onClick={() => void removeOverlay(overlay)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              );
            })}
          </section>
        ) : null}
      </aside>

      {/* Zoom */}
      <div ref={controlRef} className="gpanel gmap__zoom">
        <button type="button" aria-label="Zoom in" onClick={() => stepZoom(1)}>
          <Icon name="plus" size={19} strokeWidth={2.2} />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => stepZoom(-1)}>
          <Icon name="minus" size={19} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          aria-label="Centre on my zones"
          onClick={() => {
            const shapes = [...shapesRef.current.values()];
            if (shapes.length && mapRef.current)
              mapRef.current.fitBounds(
                L.featureGroup(shapes.map((s) => s.polygon)).getBounds(),
                { padding: [70, 70], maxZoom: 20 },
              );
          }}
        >
          <Icon name="crosshair" size={18} />
        </button>
      </div>

      {/* Contextual hint */}
      {hintText ? (
        <div className="gpanel ghint">
          <Icon name="info" size={16} className="ghint__icon" />
          <span>{hintText}</span>
          <button
            type="button"
            className="ghint__close"
            aria-label="Dismiss"
            onClick={() => setHintDismissed(true)}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ) : null}

      {/* Minimap of the drone photo */}
      {basemap === "drone" && activeOverlay ? (
        <div ref={miniRef} className="gpanel gmini">
          <div className="gmini__frame">
            <img src={api.overlayImageUrl(activeOverlay.asset_token)} alt="" />
            {miniView ? (
              <span
                className="gmini__view"
                style={{
                  left: `${miniView.left}%`,
                  top: `${miniView.top}%`,
                  width: `${miniView.width}%`,
                  height: `${miniView.height}%`,
                }}
              />
            ) : null}
          </div>
          <button
            type="button"
            className="gmini__expand"
            aria-label="Fit the whole image"
            title="Fit the whole image"
            onClick={refitDrone}
          >
            <Icon name="expand" size={15} />
          </button>
        </div>
      ) : null}

      {/* Scale */}
      <div className="gscale" aria-hidden="true">
        {scale.label}
        <div className="gscale__bar" style={{ width: scale.width }} />
      </div>

      {zones.error ? (
        <div
          className="gpanel"
          style={{ position: "absolute", zIndex: 700, left: 18, top: 78, padding: "12px 16px" }}
        >
          {zones.error}
        </div>
      ) : null}
    </div>
  );
}

/** Live "MM:SS" left on a running zone, recomputed from the run's start. */
function remainingLabel(zone: Zone, now: number): string {
  const duration = zone.duration_seconds ?? 0;
  const elapsed = zone.started_at ? (now - Date.parse(zone.started_at)) / 1000 : 0;
  return formatClock(Math.max(0, duration - elapsed));
}

/* -- GeoJSON <-> Leaflet ------------------------------------------------ */

/** GeoJSON rings are [lng,lat]; Leaflet wants [lat,lng]. */
function ringsToLatLngs(geometry: PolygonGeometry): L.LatLngExpression[][] {
  return geometry.coordinates
    .map((ring) => ring.map(([lng, lat]) => [lat, lng] as L.LatLngExpression))
    .filter((ring) => ring.length >= 3);
}

/** Reads a drawn layer back out as a closed GeoJSON Polygon. */
function layerToPolygon(layer: L.Polygon): PolygonGeometry | null {
  const geojson = layer.toGeoJSON() as {
    geometry?: { type?: string; coordinates?: number[][][] };
  };
  const geometry = geojson.geometry;
  if (geometry?.type !== "Polygon" || !Array.isArray(geometry.coordinates)) return null;
  const rings = geometry.coordinates
    .map((ring) => {
      const points = ring.map(([lng, lat]) => [lng, lat] as number[]);
      if (points.length < 3) return null;
      const [fx, fy] = points[0];
      const [lx, ly] = points[points.length - 1];
      if (fx !== lx || fy !== ly) points.push([fx, fy]);
      return points.length >= 4 ? points : null;
    })
    .filter((ring): ring is number[][] => ring !== null);
  return rings.length ? { type: "Polygon", coordinates: rings } : null;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}
