#!/usr/bin/env nbb
;; run_tests.cljs — このリポジトリが自分について言っていることの一貫性検査。
;;
;;   nbb --classpath test run_tests.cljs
;;
;; ## なぜリポジトリのルートに在るか
;;
;; okaimono のテストは 2026-09 まで 2 本あり、**どちらも 1 つのサブパッケージの
;; 中しか見ていなかった**:
;;
;;   kotoba/test/okaimono.test.ts                  → kotoba/src のドメイン論理（32 本）
;;   appview/…/cljs/test/okaimono/app_test.cljs    → default-db を default-db と比べる（4 本）
;;
;; ところがこの repo の identity と配線（nanoid・公開ホスト・DID・表示名・
;; 能力一覧・静的バンドルの経路・docs が公開している実行結果の件数）は
;; **9 つのファイルに手で写されている**。どのサブパッケージも、その隙間を
;; 所有していない —— kotoba の vitest から `wrangler.jsonc` は見えないし、
;; cljs の shadow-cljs suite から `PROJECT.jsonld` も README も見えない。
;;
;; しかも **kotoba の 32 本は今日 1 本も走らない** —— TypeScript 依存閉包が
;; 2026-08-28 に死んでおり、install できない（README と
;; docs/operator-quickstart.md §1 が測定付きで記録している）。cljs の 4 本は
;; JVM の shadow-cljs build を要する。つまり **install も network も JVM も
;; 無しに実行できる検査が、このリポジトリには 1 つも無かった。**
;;
;; **リポジトリ全体をまたぐ不変条件なので、リポジトリのルートに置く。**
;; 実装の振る舞い（tithe の按分・在庫の予約・SAGA）は kotoba の suite の
;; 担当で、ここでは重複させない。
;;
;; script host が nbb + cljs.test なのは workspace の規則（superproject
;; CLAUDE.md 「運用 tooling の script host は nbb のみ」。新規の .sh / .mjs /
;; .cjs は禁止）。同じ形の先行例が orgs/cloud-itonami/app-wvme と
;; orgs/cloud-itonami/cargo の run_tests.cljs。
(ns run-tests
  (:require [clojure.test :as t]
            [okaimono.repo-test]))

(def green-marker
  "scripts/maturity-loop/mutations.edn の `:green-marker`。**全部緑のときだけ**
  印字する —— 赤でも出してしまうと、mutation が噛んだかどうかを出力から
  判定できなくなる（run.cljs は exit code を第一の根拠にするが、マーカーは
  その裏取りに使われる）。"
  "okaimono self-description: all green")

(defmethod t/report [:cljs.test/default :end-run-tests] [m]
  (if (t/successful? m)
    (println (str "\n" green-marker))
    (do (println "\nokaimono self-description: FAILED")
        (js/process.exit 1))))

(t/run-tests 'okaimono.repo-test)
