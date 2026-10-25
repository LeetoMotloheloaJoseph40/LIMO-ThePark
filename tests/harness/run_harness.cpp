
#include <filesystem>
#include <fstream>
#include <iostream>
#include <set>
#include <string>
#include <system_error>

#include <nlohmann/json.hpp>

namespace fs = std::filesystem;
using json = nlohmann::json;

int main(int argc, char* argv[]) {
    // Determine the project root.
    fs::path root;

    try {
        if (argc > 1) {
            root = fs::absolute(argv[1]).lexically_normal();
        } else {
            // Run from the project root by default.
            root = fs::current_path();
        }

        root = fs::weakly_canonical(root);
    } catch (const fs::filesystem_error& e) {
        std::cerr << "FAIL: cannot resolve project root: "
                  << e.what() << '\n';
        return 1;
    }

    const fs::path manifest_path =
        root / "tests" / "harness" / "test_manifest.json";

    // Read and parse the JSON manifest.
    json manifest;

    try {
        std::ifstream file(manifest_path);

        if (!file) {
            throw std::runtime_error(
                "cannot open " + manifest_path.string()
            );
        }

        file >> manifest;
    } catch (const std::exception& e) {
        std::cerr << "FAIL: cannot read valid manifest: "
                  << e.what() << '\n';
        return 1;
    }

    // Validate the manifest structure.
    if (!manifest.is_object() ||
        !manifest.contains("schema_version") ||
        !manifest["schema_version"].is_number_integer() ||
        manifest["schema_version"] != 1) {
        std::cerr << "FAIL: unsupported or missing schema_version\n";
        return 1;
    }

    if (!manifest.contains("programs") ||
        !manifest["programs"].is_array() ||
        !manifest.contains("hazard_cases") ||
        !manifest["hazard_cases"].is_array()) {
        std::cerr
            << "FAIL: programs and hazard_cases must be lists\n";
        return 1;
    }

    int failures = 0;

    // Check sample program files.
    std::cout << "Checking sample program files...\n";

    for (const auto& program : manifest["programs"]) {
        std::string id = "?";
        std::string rel;

        if (program.is_object()) {
            if (program.contains("id") &&
                program["id"].is_string()) {
                id = program["id"].get<std::string>();
            }

            if (program.contains("file") &&
                program["file"].is_string()) {
                rel = program["file"].get<std::string>();
            }
        }

        if (rel.empty()) {
            std::cout << "FAIL: invalid path for "
                      << id << ": " << rel << '\n';
            ++failures;
            continue;
        }

        try {
            fs::path target =
                fs::weakly_canonical(root / rel);

            // Ensure the target is inside the project root.
            auto root_it = root.begin();
            auto target_it = target.begin();

            bool inside_root = true;

            for (; root_it != root.end();
                 ++root_it, ++target_it) {
                if (target_it == target.end() ||
                    *root_it != *target_it) {
                    inside_root = false;
                    break;
                }
            }

            if (!inside_root || target == root) {
                std::cout << "FAIL: invalid path for "
                          << id << ": " << rel << '\n';
                ++failures;
            } else if (fs::is_regular_file(target)) {
                std::cout << "PASS: " << id
                          << " file exists: " << rel << '\n';
            } else {
                std::cout << "FAIL: missing sample file: "
                          << rel << '\n';
                ++failures;
            }
        } catch (const fs::filesystem_error&) {
            std::cout << "FAIL: invalid path for "
                      << id << ": " << rel << '\n';
            ++failures;
        }
    }

    // Check hazard-case metadata.
    const auto& hazard_cases = manifest["hazard_cases"];

    std::cout << "Checking hazard-case metadata ("
              << hazard_cases.size() << " cases)...\n";

    std::set<std::string> seen;

    for (const auto& hazard : hazard_cases) {
        bool valid = hazard.is_object();

        std::string id;
        std::string name;
        std::string expected;

        if (valid &&
            hazard.contains("id") &&
            hazard["id"].is_string()) {
            id = hazard["id"].get<std::string>();
        }

        if (valid &&
            hazard.contains("name") &&
            hazard["name"].is_string()) {
            name = hazard["name"].get<std::string>();
        }

        if (valid &&
            hazard.contains("expected") &&
            !hazard["expected"].is_null() &&
            hazard["expected"] != "") {
            expected = hazard["expected"].dump();
        }

        if (!valid ||
            id.empty() ||
            seen.count(id) > 0 ||
            name.empty() ||
            expected.empty()) {
            std::cout
                << "FAIL: invalid or duplicate hazard case: "
                << hazard.dump() << '\n';
            ++failures;
        } else {
            seen.insert(id);
            std::cout << "PASS: " << id
                      << " — " << name << '\n';
        }
    }

    // Report results.
    std::cout << "\nSIMULATOR EXECUTION: NOT RUN\n";
    std::cout
        << "This scaffold checks file presence and manifest "
           "structure only.\n";
    std::cout
        << "Program results and pipeline behaviour still require "
           "the team's simulator/CLI.\n";

    if (failures > 0) {
        std::cout << "\nRESULT: FAIL — " << failures
                  << " scaffold check(s) failed.\n";
        return 1;
    }

    std::cout
        << "\nRESULT: PASS — scaffold checks passed; "
           "simulator tests are not yet integrated.\n";

    return 0;
}
