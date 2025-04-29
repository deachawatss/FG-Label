FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy solution and project files
COPY ["apps/shared/FgLabel.Shared/FgLabel.Shared.csproj", "apps/shared/FgLabel.Shared/"]
COPY ["apps/worker-service/FgLabel.Worker.csproj", "apps/worker-service/"]

# Restore dependencies
RUN dotnet restore "apps/shared/FgLabel.Shared/FgLabel.Shared.csproj"
RUN dotnet restore "apps/worker-service/FgLabel.Worker.csproj"

# Copy the rest of the code
COPY ["apps/shared/FgLabel.Shared/", "apps/shared/FgLabel.Shared/"]
COPY ["apps/worker-service/", "apps/worker-service/"]
COPY [".env", "/app/.env"]

# Build and publish
WORKDIR "/src/apps/worker-service"
RUN dotnet build "FgLabel.Worker.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "FgLabel.Worker.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
COPY --from=build /app/.env .

ENTRYPOINT ["dotnet", "FgLabel.Worker.dll"] 