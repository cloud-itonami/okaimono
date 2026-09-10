(ns okaimono.app
  "Okaimono shopping-mcp appview frontend shell.

  Migrated from the SvelteKit scaffold at
  appview/okaimono-shopping-mcp-component/svelte to reagent + re-frame,
  rendered with `jp-go-dds.core` (デジタル庁デザインシステム) hiccup. The
  source had two `.svelte` files, both ported here, one-to-one:

  - `src/App.svelte` — a heading + one paragraph, no interactivity. Ported as
    `app-component` below, its two text nodes now held as re-frame app-db
    data instead of markup literals, so there is real event/sub logic to
    test.
  - `src/routes/+page.svelte` — the SvelteKit route for `/`, whose entire
    body was `<script>import App from '../App.svelte'</script><App />`: it
    contributed no content of its own, only wired `App` to the route. Ported
    as `home-page` below, which plays the same role (the thing mounted at
    `/`) without inventing a second document or a second mount — this
    workspace is single-page-app-only (ADR-2608080100): one document, one
    bundle, one mount, with views held as data, not as literal SvelteKit
    route files.

  `public/index.html`'s inlined <style> was produced once, at authoring time,
  by `jp-go-dds.page/->page` running on the JVM (via this deps.edn's jp-go-dds
  git/sha), concatenating the vendored `dds.css` with `jp-go-dds.core/ext-css`
  — exactly what `jp-go-dds.page/page` composes for its own <style> block.
  This namespace itself only requires `jp-go-dds.core` — the browser bundle
  does not need `jp-go-dds.page` or `html.core` at runtime; those are JVM-only
  tools used to author the static shell once. Regenerate that shell (e.g. if
  jp-go-dds's core components or ext-rules change) with:

    (require '[jp-go-dds.page :as page] '[clojure.java.io :as io])
    (spit \"public/index.html\"
          (page/->page {:title \"okaimono-shopping-mcp-component\"
                         :description \"Okaimono shopping-mcp appview frontend shell (reagent + re-frame + jp-go-dds).\"
                         :css (slurp (io/resource \"jp_go_dds/dds.css\"))}
                        [:div {:id \"app\"}]
                        [:script {:src \"js/app.js\"}]))"
  (:require [reagent.dom :as rdom]
            [re-frame.core :as rf]
            [jp-go-dds.core :as dds]))

;; --- state ------------------------------------------------------------------

(def default-db
  "The two pieces of text the original App.svelte scaffold rendered as bare
  markup literals (a heading and one paragraph), now held as re-frame app-db
  data instead, so there is real event/sub logic to test."
  {:page/heading "okaimono-shopping-mcp-component"
   :page/description "Vite entry scaffold after SvelteKit cleanup."})

(rf/reg-event-db
 :initialize-db
 (fn [_ _] default-db))

(rf/reg-sub
 :page/heading
 (fn [db _] (:page/heading db)))

(rf/reg-sub
 :page/description
 (fn [db _] (:page/description db)))

;; --- view ---------------------------------------------------------------

(defn app-component
  "Port of `src/App.svelte`: a DADS heading + lead paragraph, centered the
  same way the original `main { display: grid; place-content: center; }`
  scaffold was — via the `dds-ext-hero`/`dds-ext-center` layout classes
  jp-go-dds.core already ships in `ext-css`, not app-authored CSS."
  []
  [:main {:class "dds-ext-hero dds-ext-center"}
   (dds/heading 1 @(rf/subscribe [:page/heading]))
   [:p {:class "dds-ext-lead"} @(rf/subscribe [:page/description])]])

(defn home-page
  "Port of `src/routes/+page.svelte`, which rendered nothing of its own and
  only wired `App` to the `/` route. This is the whole page for `/`."
  []
  [app-component])

;; --- mount ------------------------------------------------------------------

(defn render []
  (rdom/render [home-page] (.getElementById js/document "app")))

(defn ^:export main []
  (rf/dispatch-sync [:initialize-db])
  (render))
