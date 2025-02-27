/*
 * Copyright (C) Online-Go.com
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* The OGSScoreEstimator method is a wasm compiled C program that
 * does simple random playouts. On the client, the OGSScoreEstimator script
 * is loaded in an async fashion, so at some point that global variable
 * becomes not null and can be used.
 */

import * as GoMath from "../GoMath";

declare const CLIENT: boolean;

declare let OGSScoreEstimator: any;
let OGSScoreEstimator_initialized = false;
let OGSScoreEstimatorModule: any;

let init_promise: Promise<boolean>;

export function init_score_estimator(): Promise<boolean> {
    if (!CLIENT) {
        throw new Error("Only initialize WASM library on the client side");
    }

    if (OGSScoreEstimator_initialized) {
        return Promise.resolve(true);
    }

    if (init_promise) {
        return init_promise;
    }

    try {
        if (
            !OGSScoreEstimatorModule &&
            (("OGSScoreEstimator" in window) as any) &&
            ((window as any)["OGSScoreEstimator"] as any)
        ) {
            OGSScoreEstimatorModule = (window as any)["OGSScoreEstimator"] as any;
        }
    } catch (e) {
        console.error(e);
    }

    if (OGSScoreEstimatorModule) {
        OGSScoreEstimatorModule = OGSScoreEstimatorModule();
        OGSScoreEstimator_initialized = true;
        return Promise.resolve(true);
    }

    const script: HTMLScriptElement = document.getElementById(
        "ogs_score_estimator_script",
    ) as HTMLScriptElement;
    if (script) {
        let resolve: (tf: boolean) => void;
        init_promise = new Promise<boolean>((_resolve, _reject) => {
            resolve = _resolve;
        });

        script.onload = () => {
            OGSScoreEstimatorModule = OGSScoreEstimator;
            OGSScoreEstimatorModule = OGSScoreEstimatorModule();
            OGSScoreEstimator_initialized = true;
            resolve(true);
        };

        return init_promise;
    } else {
        return Promise.reject("score estimator not available");
    }
}

export function estimateScoreWasm(
    board: number[][],
    color_to_move: "black" | "white",
    trials: number,
    tolerance: number,
) {
    if (!OGSScoreEstimator_initialized) {
        throw new Error("Score estimator not intialized yet, uptime = " + performance.now());
    }

    const width = board[0].length;
    const height = board.length;
    const nbytes = 4 * width * height;
    const ptr = OGSScoreEstimatorModule._malloc(nbytes);
    const ints = new Int32Array(OGSScoreEstimatorModule.HEAP32.buffer, ptr, nbytes);
    let i = 0;
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            ints[i] = board[y][x];
            ++i;
        }
    }
    const _estimate = OGSScoreEstimatorModule.cwrap("estimate", "number", [
        "number",
        "number",
        "number",
        "number",
        "number",
        "number",
    ]);
    const estimate = _estimate as (
        w: number,
        h: number,
        p: number,
        c: number,
        tr: number,
        to: number,
    ) => number;
    estimate(width, height, ptr, color_to_move === "black" ? 1 : -1, trials, tolerance);

    const ownership = GoMath.makeMatrix(width, height, 0);
    i = 0;
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            ownership[y][x] = ints[i];
            ++i;
        }
    }

    OGSScoreEstimatorModule._free(ptr);

    return ownership;
}
