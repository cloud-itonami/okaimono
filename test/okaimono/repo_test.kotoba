(ns okaimono.repo-test
  "**このリポジトリが自分について言っていることが、互いに一致しているか。**

  okaimono の identity と配線（nanoid・公開ホスト・DID・表示名・能力一覧・
  静的バンドルの経路・そして docs が公開している実行結果の件数）は、
  **9 つのファイルに別々に書かれている**:

    appview/okaimono-shopping-mcp-component/wrangler.jsonc   name / routes / assets / vars
    appview/okaimono-shopping-mcp-component/kotodama.jsonld  @id / nanoid / routes / profile
    appview/okaimono-checkout-agent-component/kotodama.jsonld @id / project
    appview/…/cljs/shadow-cljs.edn                           :init-fn / :output-dir / :asset-path / :ns-regexp
    appview/…/cljs/deps.edn                                  :test alias の :extra-paths
    appview/…/cljs/public/index.html                         <script src>
    appview/…/cljs/src/okaimono/app.cljs                     ns 名 / ^:export main
    README.md                                                Layout 表 / リンク / テスト件数
    docs/operator-quickstart.md                              測定済みのテスト件数

  **どれ 1 つを書き換えても、他の 8 つは黙っている。**

  ## なぜ既存の 2 本では足りないか

  このリポジトリには既にテストが 2 本ある。どちらもファイルとファイルの間を
  見ていない:

  - `kotoba/test/okaimono.test.ts` —— 32 本の本物のテストだが、見るのは
    `kotoba/src` のドメイン論理だけ。そして **2026-08-28 以降そもそも
    install できない**（TypeScript 依存閉包が死んでいる。README と
    quickstart §1 が測定付きで記録している）ので、今日は 1 本も走らない。
  - `appview/…/cljs/test/okaimono/app_test.cljs` —— `default-db` を
    `default-db` と比べる 4 本。JVM の shadow-cljs build が要る。

  つまり **今日このリポジトリで実際に実行できる検査は、自分自身を
  自分自身と比べる 4 本だけ**である。ここが見るのはその隙間で、
  install も network も JVM も要らない（nbb だけで走る）。

  ## 意図的に pin していないもの

  1. **`PROJECT.jsonld` の `hasPart` は 6 件とも実在しない場所を指す**
     （`wasm/okaimono-shopping-mcp-component`・`integration/ec/PROJECT.jsonld`・
     `wasm/okaimono-source-crawler-component`・`data/resources/`・
     `data/entities/`・`data/crawler/collection-plan.jsonld`）。README は
     『Neither the `wasm/` directory nor the `etzhayyim` CLI exists in this
     repository』と既に記録しており、**まだ直っていない**。直っていないものを
     不変条件にすると、誤りを正しさとして固定する。
  2. **`kotodama.jsonld` の `triggers.http.staticDir` は `/wasm/cljs/public`**
     を指す。同じ `wasm/` 由来の残骸だが、これは deploy された component の
     中のパスかもしれず、この repo についての主張と読み切れない。
  3. **2 つの component descriptor が同じ `@id`** を名乗る
     （どちらも `did:web:okaimono.etzhayyim.com`）。checkout-agent 側は
     `nanoid` が `a1ef52ee` なのに space channel が `1ef52ee4-feed` で、
     こちらも食い違う。**命名の契約を確かめられていない**ので判定しない。
  4. **`vars.APP_CAPABILITIES`(2) と `profile.capabilities`(4) は一致しない**
     （descriptor だけが `unispsc-classification` / `unispsc-catalog-import`
     を持つ）。等価は今日成り立たないので、**危険な向きだけ**を見る ——
     Worker は descriptor が与えていない能力を名乗ってはならない（下の
     `the-worker-never-claims-a-capability-the-descriptor-does-not-grant`）。
  5. **`README.edn` / `migration.edn` / `README.md` / west の 4 つの名前**は
     互いに違う。quickstart の『Repository identity is inconsistent』節が
     一覧にしている既知の齟齬。ここでは *同じ名前を使っている 2 ファイル* が
     揃っていることだけを見る。

  実行:  nbb --classpath test run_tests.cljs"
  (:require [kotoba.lang.text :as str]
            [clojure.test :refer [deftest is testing]]
            [cljs.reader :as reader]
            ["node:fs" :as fs]
            ["node:path" :as path]))

(def repo-root (.cwd js/process))

(defn- slurp* [rel] (.readFileSync fs (path/join repo-root rel) "utf8"))
(defn- exists? [rel] (.existsSync fs (path/join repo-root rel)))

(def appview "appview/okaimono-shopping-mcp-component")
(def cljs-dir (str appview "/cljs"))

;; ── jsonc を読む ────────────────────────────────────────────────────────────
;;
;; wrangler.jsonc は **行頭の `//` コメント**を持ち、同時に **文字列の中に
;; `//` を持つ**（`"https://mcp.etzhayyim.com/xrpc/…"` と
;; `"https://ok4imn1o.etzhayyim.com/?embed=1"`）。素朴な `s/\/\/.*//` は
;; 後者を壊す —— JSON 文字列は行をまたげないので、**行頭が `//` の行だけ**を
;; 落とすのは安全であり、かつその安全性は下の
;; `the-jsonc-reader-does-not-eat-the-urls-inside-the-strings` が実際に確かめる。

(defn- strip-line-comments
  "行頭（空白を除く）が `//` の行だけを落とす。`{:text … :dropped n}`。"
  [s]
  (let [ls (str/split-lines s)
        keep* (remove #(re-find #"^\s*//" %) ls)]
    {:text (str/join "\n" keep*)
     :dropped (- (count ls) (count keep*))}))

(def wrangler-raw (slurp* (str appview "/wrangler.jsonc")))
(def wrangler-stripped (strip-line-comments wrangler-raw))
(def wrangler (js->clj (.parse js/JSON (:text wrangler-stripped))))

(defn- json* [rel] (js->clj (.parse js/JSON (slurp* rel))))

(def kotodama          (json* (str appview "/kotodama.jsonld")))
(def kotodama-checkout (json* "appview/okaimono-checkout-agent-component/kotodama.jsonld"))
(def readme        (slurp* "README.md"))
(def quickstart    (slurp* "docs/operator-quickstart.md"))
(def shadow        (reader/read-string (slurp* (str cljs-dir "/shadow-cljs.edn"))))
(def cljs-deps     (reader/read-string (slurp* (str cljs-dir "/deps.edn"))))
(def index-html    (slurp* (str cljs-dir "/public/index.html")))
(def app-cljs      (slurp* (str cljs-dir "/src/okaimono/app.cljs")))
(def vitest-src    (slurp* "kotoba/test/okaimono.test.ts"))
(def app-test-cljs (slurp* (str cljs-dir "/test/okaimono/app_test.cljs")))
(def readme-edn    (reader/read-string (slurp* "README.edn")))
(def migration     (reader/read-string (slurp* "migration.edn")))

;; ── 抽出 ────────────────────────────────────────────────────────────────────

(def nanoid (get kotodama "nanoid"))

(def wrangler-route-hosts
  (mapv #(first (str/split (get % "pattern") #"/")) (get wrangler "routes")))

(def kotodama-route-hosts (mapv #(get % "host") (get kotodama "routes")))

(def did-host
  "`did:web:<host>` の host。did:web は `https://<host>/.well-known/did.json` に
   解決するので、この host は route されていなければ誰も解決できない。"
  (second (re-find #"^did:web:([^:]+)$" (get kotodama "@id"))))

(def wrangler-capabilities
  "wrangler の var は文字列しか取れないので、JSON 文字列を値に持つ。"
  (js->clj (.parse js/JSON (get-in wrangler ["vars" "APP_CAPABILITIES"]))))

(def kotodama-capabilities (get-in kotodama ["profile" "capabilities"]))

(def index-script-srcs
  (mapv second (re-seq #"<script[^>]*\ssrc=\"([^\"]+)\"" index-html)))

(def app-build (get-in shadow [:builds :app]))
(def test-build (get-in shadow [:builds :test]))
(def init-fn (get-in app-build [:modules :app :init-fn]))

(def readme-layout-paths
  "README の `## Layout` 表の **1 列目**だけ。本文の散文は、削除済みの
   `svelte/` や存在しない `wasm/` を意図的に名指しするので対象にしない。"
  (let [beg (str/index-of readme "## Layout")
        end (when beg (str/index-of readme "\n## " (inc beg)))
        block (when beg (subs readme beg (or end (count readme))))]
    (when block
      (mapv second (re-seq #"(?m)^\|\s*`([^`]+)`\s*\|" block)))))

(def readme-relative-links
  "README の `](path)` のうち、リポジトリ相対のもの。"
  (->> (re-seq #"\]\(([^)]+)\)" readme)
       (map second)
       (remove #(or (str/starts-with? % "http") (str/starts-with? % "#")))
       vec))

;; docs が公開している「測った件数」と、コードが今持っている件数。
;; **どちらも読み取りで、片方を定数として書かない** —— 定数にすると、
;; テストが増えたときに docs だけが古くなる（それがまさにこの repo で
;; 起きたこと: quickstart 自身が『MIGRATION-TODO.md still claims "14/14"』と
;; 記録している）。

(def quickstart-vitest-count
  (some-> (re-find #"Tests\s+(\d+) passed" quickstart) second js/parseInt))

(def readme-vitest-count
  (some-> (re-find #"npm test` \((\d+) tests\)" readme) second js/parseInt))

(def quickstart-cljs-counts
  (when-let [m (re-find #"Ran (\d+) tests containing (\d+) assertions" quickstart)]
    {:tests (js/parseInt (nth m 1)) :assertions (js/parseInt (nth m 2))}))

(def vitest-case-count      (count (re-seq #"(?m)^\s+it\(" vitest-src)))
(def cljs-deftest-count     (count (re-seq #"(?m)^\(deftest " app-test-cljs)))
(def cljs-assertion-count   (count (re-seq #"\(is " app-test-cljs)))

;; ── その 0: この suite が読んでいる値が、実際に読めているか ─────────────────

(deftest the-files-this-suite-reads-still-declare-what-it-reads-from-them
  (testing "抽出が nil を返したら、以下の比較は全部『nil = nil』で緑になりうる。
            **読めなかったことを、一致したことと同じ値にしない**（superproject
            CLAUDE.md の evidence floor）。"
    (is (some? nanoid) "kotodama.jsonld の `nanoid` が読めない")
    (is (some? did-host) "kotodama.jsonld の `@id` が did:web:<host> の形でない")
    (is (seq wrangler-route-hosts) "wrangler.jsonc の routes[] が空")
    (is (seq kotodama-route-hosts) "kotodama.jsonld の routes[] が空")
    (is (seq wrangler-capabilities) "wrangler.jsonc の vars.APP_CAPABILITIES が空")
    (is (seq kotodama-capabilities) "kotodama.jsonld の profile.capabilities が空")
    (is (some? init-fn) "shadow-cljs.edn の :builds :app :modules :app :init-fn が読めない")
    (is (seq index-script-srcs) "public/index.html に <script src> が 1 つも無い")
    (is (>= (count readme-layout-paths) 4)
        (str "README の Layout 表から取れたパスが 4 未満: " (pr-str readme-layout-paths)))
    (is (seq readme-relative-links) "README にリポジトリ相対のリンクが 1 つも無い")
    (is (some? quickstart-vitest-count) "quickstart の vitest 件数が読めない")
    (is (some? readme-vitest-count) "README の vitest 件数が読めない")
    (is (some? quickstart-cljs-counts) "quickstart の cljs.test 件数が読めない")
    (is (pos? vitest-case-count) "kotoba/test/okaimono.test.ts に it( が 1 つも無い")
    (is (pos? cljs-deftest-count) "app_test.cljs に deftest が 1 つも無い")))

;; ── その 1: jsonc の読み方が、文字列の中の // を壊していないか ───────────────

(deftest the-jsonc-reader-does-not-eat-the-urls-inside-the-strings
  (testing "wrangler.jsonc は行頭 `//` のコメントと、`https://` を含む文字列の
            **両方**を持つ。素朴な `s#//.*##` はどちらも同じ形に見えるので、
            後者を黙って切り詰める（あるいは JSON を壊す）。剥がした行数と、
            剥がした後も URL が丸ごと残っていることを、別々に確かめる。"
    (is (pos? (:dropped wrangler-stripped))
        "行頭コメントが 1 行も無い —— この剥がしは何も試していない")
    (is (str/includes? wrangler-raw "https://")
        "文字列の中に `//` が 1 つも無い —— この検査は危険な入力を見ていない")
    (doseq [k ["APP_EMBED_URL" "AGENTGATEWAY_MCP_ROUTER_URL"]]
      (let [v (get-in wrangler ["vars" k])]
        (is (re-find #"^https://[^/]+/.+" v)
            (str k " が host の後の path を失っている: " (pr-str v)))
        (is (str/includes? wrangler-raw v)
            (str k " の値が生ファイルに現れない = 読む途中で変わっている: " (pr-str v)))))))

;; ── その 2: nanoid は 1 つの文字列で、5 箇所に書かれている ──────────────────

(deftest the-nanoid-is-the-same-string-in-every-place-that-spells-it
  (testing "`ok4imn1o` は kotodama の nanoid・wrangler の Worker 名・
            vars.APP_NANOID・公開ルート・埋め込み URL・descriptor 側の
            route に、それぞれ手で書かれている。1 箇所だけ直す、が
            この形の repo で最も起きる drift。"
    (is (= nanoid (get-in wrangler ["vars" "APP_NANOID"]))
        "kotodama の nanoid と wrangler の vars.APP_NANOID が違う")
    (is (= (str "kotodama-" nanoid) (get wrangler "name"))
        (str "Worker 名が kotodama-<nanoid> でない: " (pr-str (get wrangler "name"))))
    (is (some #{(str nanoid ".etzhayyim.com")} wrangler-route-hosts)
        (str "wrangler の routes に <nanoid>.etzhayyim.com が無い: " (pr-str wrangler-route-hosts)))
    (is (some #{(str nanoid ".etzhayyim.com")} kotodama-route-hosts)
        (str "kotodama の routes に <nanoid>.etzhayyim.com が無い: " (pr-str kotodama-route-hosts)))
    (is (= (str "https://" nanoid ".etzhayyim.com/?embed=1")
           (get-in wrangler ["vars" "APP_EMBED_URL"]))
        "APP_EMBED_URL の host が nanoid と揃っていない")))

;; ── その 3: DID を解決した相手は、この Worker に到達できるか ─────────────────

(deftest the-did-host-is-a-host-this-worker-answers-for
  (testing "`did:web:<host>` は `https://<host>/.well-known/did.json` に解決する。
            その host が route から落ちると、DID を解決した相手はここへ届かない
            —— did document を書く前に route が要る。"
    (is (some #{did-host} kotodama-route-hosts)
        (str "@id の host `" did-host "` が kotodama の routes に無い: "
             (pr-str kotodama-route-hosts)))
    (is (= "okaimono" (get kotodama "project"))
        "shopping component の project が okaimono でない")
    (is (= "okaimono" (get kotodama-checkout "project"))
        "checkout-agent component の project が okaimono でない")
    (is (str/starts-with? (get kotodama-checkout "@id") "did:web:")
        "checkout-agent の @id が did:web: でない")))

;; ── その 4: descriptor と Worker の vars が、同じ欄について同じことを言うか ──

(deftest the-descriptor-and-the-worker-vars-agree-field-by-field
  (testing "kotodama.jsonld は did:web を解決した相手が読み、wrangler.jsonc の
            vars は Worker 自身が実行時に読む。**同じ欄が 2 回書かれている**ので、
            片方だけ直すと外から見た名前と中から名乗る名前が割れる。"
    (is (= (get-in kotodama ["profile" "displayName"]) (get-in wrangler ["vars" "APP_DISPLAY_NAME"]))
        "displayName が descriptor と vars で違う")
    (is (= (get-in kotodama ["profile" "description"]) (get-in wrangler ["vars" "APP_DESCRIPTION"]))
        "description が descriptor と vars で違う")
    (is (= (get kotodama "uiType") (get-in wrangler ["vars" "APP_UI_TYPE"]))
        "uiType が descriptor と vars で違う")
    (is (= (get kotodama "performerType") (get-in wrangler ["vars" "APP_PERFORMER_TYPE"]))
        "performerType が descriptor と vars で違う")))

(deftest the-worker-never-claims-a-capability-the-descriptor-does-not-grant
  (testing "この 2 つは**等しくない** —— descriptor だけが
            `unispsc-classification` と `unispsc-catalog-import` を持つ。
            等価を pin すると今日から赤くなるので、危険な向きだけを見る:
            Worker が名乗る能力は、descriptor が与えたものの中に無ければ
            ならない。逆向き（descriptor の方が広い）は許す。"
    (is (seq wrangler-capabilities) "APP_CAPABILITIES が空 —— この包含は空虚")
    (is (empty? (remove (set kotodama-capabilities) wrangler-capabilities))
        (str "Worker が descriptor に無い能力を名乗っている: "
             (pr-str (vec (remove (set kotodama-capabilities) wrangler-capabilities)))))))

;; ── その 5: wrangler が名指しするリポジトリ内の経路は実在するか ──────────────

(deftest every-repo-path-the-deploy-config-names-exists
  (testing "この wrangler.jsonc の直前の版は、削除済みの
            `svelte/.svelte-kit/cloudflare/_worker.js` を `main` に指したまま
            残っていた（README の Deployment 節がその経緯を書いている）。
            **設定が名指しする経路が消えたことを、誰も見ていなかった。**
            `main` は今は無いので、在るときだけ検査する —— その分岐が
            飛ばされたのか通ったのかを出力から読めるように、`main` の
            有無そのものを別に記録する。"
    (let [named (cond-> [[:assets.directory (get-in wrangler ["assets" "directory"])]]
                  (contains? wrangler "main") (conj [:main (get wrangler "main")]))]
      (is (seq named) "wrangler.jsonc が経路を 1 つも名指ししていない")
      (doseq [[k v] named]
        (is (exists? (path/join appview v))
            (str k " が指す `" v "` が存在しない"))))
    (is (exists? (str cljs-dir "/public/index.html"))
        "serve される directory に index.html が無い")))

;; ── その 6: 静的バンドルの配線が端から端まで繋がっているか ───────────────────

(deftest the-static-bundle-is-wired-end-to-end
  (testing "shadow-cljs が書く場所（:output-dir）・document が読む場所
            （:asset-path + module 名）・Cloudflare が配る場所
            （assets.directory）の 3 つは別々に書かれている。1 つずらすと
            **ビルドは緑のまま document が空になる**。"
    (let [assets-dir (get-in wrangler ["assets" "directory"])
          served     (path/normalize (path/join appview assets-dir))
          out-dir    (path/normalize (path/join cljs-dir (:output-dir app-build)))
          module     (name (first (keys (:modules app-build))))]
      (is (str/starts-with? out-dir (str served "/"))
          (str ":output-dir `" out-dir "` が配信対象 `" served "` の下に無い"))
      (is (= [(str (:asset-path app-build) "/" module ".js")] index-script-srcs)
          (str "index.html の <script src> が :asset-path + module 名と一致しない: "
               (pr-str index-script-srcs))))
    (is (= 1 (count index-script-srcs))
        (str "document が読む script が 1 本でない（ADR-2608080100: 1 文書 1 バンドル 1 mount）: "
             (pr-str index-script-srcs)))
    (let [[ns-part var-part] (str/split (str init-fn) #"/")]
      (is (= "okaimono.app" ns-part) (str ":init-fn の ns が okaimono.app でない: " (pr-str init-fn)))
      (is (exists? (str cljs-dir "/src/okaimono/app.cljs")) ":init-fn の ns に対応するファイルが無い")
      (is (str/includes? app-cljs (str "(ns " ns-part))
          "app.cljs の ns 宣言が :init-fn の ns と違う")
      (is (str/includes? app-cljs (str "(defn ^:export " var-part " ["))
          (str ":init-fn `" init-fn "` の var が ^:export で宣言されていない"
               " —— :advanced で名前が潰れて init が呼ばれない")))))

;; ── その 7: cljs の test build は、実際にテストを拾うか ──────────────────────

(deftest the-cljs-test-build-still-selects-the-test-namespace
  (testing "`:ns-regexp` に一致する ns が 1 つも無くても
            `shadow-cljs compile test` は成功し、`node out/tests.js` は
            `Ran 0 tests` と言って **exit 0 で終わる**。つまり ns を改名すると
            『測っていない』が『測って問題が無かった』と同じ顔になる
            （superproject CLAUDE.md の 6 問の 1 番目）。"
    (let [re (re-pattern (:ns-regexp test-build))
          ns-names (mapv second (re-seq #"(?m)^\(ns ([A-Za-z0-9.\-]+)"
                                        app-test-cljs))]
      (is (some? (:ns-regexp test-build)) "shadow-cljs.edn の :test に :ns-regexp が無い")
      (is (seq ns-names) "app_test.cljs から ns 名が読めない")
      (is (every? #(re-find re %) ns-names)
          (str ":ns-regexp `" (:ns-regexp test-build) "` が "
               (pr-str ns-names) " を拾わない = 0 テストで緑になる")))
    (is (= ["test"] (get-in cljs-deps [:aliases :test :extra-paths]))
        "deps.edn の :test alias が test/ を path に載せていない")
    (is (exists? (str cljs-dir "/test/okaimono/app_test.cljs"))
        ":extra-paths が指す test/ にテストファイルが無い")))

;; ── その 8: docs が公開している件数は、コードが今持っている件数か ────────────

(deftest the-test-counts-the-docs-publish-are-the-counts-the-code-has
  (testing "quickstart は『32 passed』『Ran 4 tests containing 6 assertions』を
            **測定値として**載せ、README も『(32 tests)』と書く。この repo は
            まさにこの形で一度腐っている —— quickstart 自身が
            『MIGRATION-TODO.md still claims \"14/14\". That number is stale』と
            記録している。どちらの数もファイルから読むので、片側だけ直しても
            揃わない。"
    (is (= vitest-case-count quickstart-vitest-count)
        (str "quickstart の vitest 件数 " quickstart-vitest-count
             " と test/okaimono.test.ts の it( 件数 " vitest-case-count " が違う"))
    (is (= vitest-case-count readme-vitest-count)
        (str "README の vitest 件数 " readme-vitest-count
             " と test/okaimono.test.ts の it( 件数 " vitest-case-count " が違う"))
    (is (= cljs-deftest-count (:tests quickstart-cljs-counts))
        (str "quickstart の cljs テスト数 " (:tests quickstart-cljs-counts)
             " と app_test.cljs の deftest 数 " cljs-deftest-count " が違う"))
    (is (= cljs-assertion-count (:assertions quickstart-cljs-counts))
        (str "quickstart の assertion 数 " (:assertions quickstart-cljs-counts)
             " と app_test.cljs の (is 数 " cljs-assertion-count " が違う"))))

;; ── その 9: README が名指しする場所は実在するか ─────────────────────────────

(deftest every-path-the-readme-points-at-exists
  (testing "README の散文は、削除済みの `svelte/` や存在しない `wasm/` を
            **意図的に**名指しする（何が無いかを説明するため）ので、見るのは
            Layout 表の 1 列目とリポジトリ相対リンクだけにする。この 2 つは
            『ここに在る』と主張している場所である。"
    (doseq [p readme-layout-paths]
      (is (exists? p) (str "README の Layout 表が指す `" p "` が存在しない")))
    (doseq [l readme-relative-links]
      (is (exists? l) (str "README のリンク先 `" l "` が存在しない")))))

;; ── その 10: 移行のときに付けた 2 ファイルが、まだ揃っているか ───────────────

(deftest the-two-files-that-use-the-migration-name-still-agree
  (testing "このリポジトリは 4 つの名前を持ち、どれも一致しない（quickstart の
            『Repository identity is inconsistent』節）。**その中で
            `com-etzhayyim-app-okaimono` を使っているのは README.edn と
            migration.edn の 2 つだけ**なので、その 2 つが揃っていることだけを
            見る。4 つを揃えるのは別の作業。"
    (is (= (:name readme-edn)
           (last (str/split (get-in migration [:destination :repository]) #"/")))
        (str "README.edn の :name と migration.edn の destination が違う: "
             (pr-str (:name readme-edn)) " / "
             (pr-str (get-in migration [:destination :repository]))))
    (let [adds (get-in migration [:identity :allowed-additions])]
      (is (seq adds) "migration.edn の :allowed-additions が空")
      (doseq [f adds]
        (is (exists? f) (str "migration.edn が allowed-addition と宣言する `" f "` が無い"))))))
