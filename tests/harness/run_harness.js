
#!/usr/bin/env node
"use strict";

/**
 * Dependency-free structural checker for the LIMO-ThePark test manifest.
 */

const fs = require("node:fs");
const path = require("node:path");

function main() {
    // Determine the project root.
    const root = path.resolve(
        process.argv[2] || path.resolve(__dirname, "../..")
    );

    const manifestPath = path.join(
        root,
        "tests",
        "harness",
        "test_manifest.json"
    );

    let manifest;

    // Read and parse the manifest.
    try {
        const content = fs.readFileSync(manifestPath, "utf8");
        manifest = JSON.parse(content);
    } catch (error) {
        console.error(
            `FAIL: cannot read valid manifest: ${error.message}`
        );
        return 1;
    }

    // Validate the manifest structure.
    if (
        manifest === null ||
        typeof manifest !== "object" ||
        Array.isArray(manifest) ||
        manifest.schema_version !== 1
    ) {
        console.error(
            "FAIL: unsupported or missing schema_version"
        );
        return 1;
    }

    if (
        !Array.isArray(manifest.programs) ||
        !Array.isArray(manifest.hazard_cases)
    ) {
        console.error(
            "FAIL: programs and hazard_cases must be lists"
        );
        return 1;
    }

    let failures = 0;

    // Check sample program files.
    console.log("Checking sample program files...");

    for (const program of manifest.programs) {
        const id =
            program && typeof program.id === "string"
                ? program.id
                : "?";

        const rel =
            program && typeof program.file === "string"
                ? program.file
                : "";

        if (!rel) {
            console.log(`FAIL: invalid path for ${id}: ${rel}`);
            failures++;
            continue;
        }

        const target = path.resolve(root, rel);
        const relative = path.relative(root, target);

        // Prevent paths from escaping the project root.
        if (
            relative === "" ||
            relative === ".." ||
            relative.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relative)
        ) {
            console.log(`FAIL: invalid path for ${id}: ${rel}`);
            failures++;
        } else if (
            fs.existsSync(target) &&
            fs.statSync(target).isFile()
        ) {
            console.log(`PASS: ${id} file exists: ${rel}`);
        } else {
            console.log(`FAIL: missing sample file: ${rel}`);
            failures++;
        }
    }

    // Check hazard-case metadata.
    console.log(
        `Checking hazard-case metadata (${manifest.hazard_cases.length} cases)...`
    );

    const seen = new Set();

    for (const hazard of manifest.hazard_cases) {
        const isObject =
            hazard !== null &&
            typeof hazard === "object" &&
            !Array.isArray(hazard);

        const id =
            isObject && typeof hazard.id === "string"
                ? hazard.id
                : "";

        const name =
            isObject && typeof hazard.name === "string"
                ? hazard.name
                : "";

        const hasExpected =
            isObject &&
            Object.hasOwn(hazard, "expected") &&
            hazard.expected !== null &&
            hazard.expected !== "";

        if (
            !id ||
            seen.has(id) ||
            !name ||
            !hasExpected
        ) {
            console.log(
                `FAIL: invalid or duplicate hazard case: ${JSON.stringify(hazard)}`
            );
            failures++;
        } else {
            seen.add(id);
            console.log(`PASS: ${id} — ${name}`);
        }
    }

    // Report results.
    console.log("\nSIMULATOR EXECUTION: NOT RUN");
    console.log(
        "This scaffold checks file presence and manifest structure only."
    );
    console.log(
        "Program results and pipeline behaviour still require the team's simulator/CLI."
    );

    if (failures > 0) {
        console.log(
            `\nRESULT: FAIL — ${failures} scaffold check(s) failed.`
        );
        return 1;
    }

    console.log(
        "\nRESULT: PASS — scaffold checks passed; simulator tests are not yet integrated."
    );

    return 0;
}

process.exitCode = main();
