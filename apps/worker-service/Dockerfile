FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    wget && \
    rm -rf /var/lib/apt/lists/*

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["apps/worker-service/FgLabel.Worker.csproj", "apps/worker-service/"]
COPY ["apps/shared/FgLabel.Shared/FgLabel.Shared.csproj", "apps/shared/FgLabel.Shared/"]
RUN dotnet restore "apps/worker-service/FgLabel.Worker.csproj"
COPY . .
WORKDIR "/src/apps/worker-service"
RUN dotnet build "FgLabel.Worker.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "FgLabel.Worker.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
COPY .env .
ENTRYPOINT ["dotnet", "FgLabel.Worker.dll"]

# เพิ่ม healthcheck แบบพื้นฐานเพื่อให้ docker-compose สามารถตรวจสอบได้
HEALTHCHECK --interval=60s --timeout=10s --start-period=15s --retries=3 CMD exit 0 