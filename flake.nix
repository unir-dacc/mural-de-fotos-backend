{
  description = "NixOS and macOS environment";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          packages =
            with pkgs;
            [
              nodejs_22
              yarn
              nodePackages.typescript
              nodePackages.typescript-language-server
              openssl
              pkg-config
              pre-commit
              cmake
              poetry
              python312Packages.pip
              python312
              pyright
              commitizen
              postgresql
              git
              docker-compose
              ruff
              gettext
            ]
            ++ (lib.optionals stdenv.isDarwin [
              # Dependências específicas para macOS (SDKs de framework se necessário)
              darwin.apple_sdk.frameworks.Security
              darwin.apple_sdk.frameworks.CoreFoundation
            ]);

          shellHook = ''
            export PRISMA_SCHEMA_ENGINE_BINARY="${pkgs.prisma-engines}/bin/schema-engine"
            export PRISMA_QUERY_ENGINE_BINARY="${pkgs.prisma-engines}/bin/query-engine"
            export PRISMA_QUERY_ENGINE_LIBRARY="${pkgs.prisma-engines}/lib/libquery_engine.node"
            export PRISMA_FMT_BINARY="${pkgs.prisma-engines}/bin/prisma-fmt"

            # Garante que o husky não quebre se não houver um .git
            [ -d .git ] && npx husky || echo "Husky skip: .git not found"
          '';
        };
      }
    );
}
