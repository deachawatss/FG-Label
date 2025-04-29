FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libldap-2.5-0 \
    libsasl2-modules \
    libssl3 \
    libldap2-dev \
    libsasl2-dev && \
    mkdir -p /usr/lib/x86_64-linux-gnu/ && \
    ln -sf /usr/lib/x86_64-linux-gnu/libldap-2.5.so.0 /usr/lib/x86_64-linux-gnu/libldap-2.4.so.2 && \
    ln -sf /usr/lib/x86_64-linux-gnu/liblber-2.5.so.0 /usr/lib/x86_64-linux-gnu/liblber-2.4.so.2 && \
    ln -sf /usr/lib/x86_64-linux-gnu/libldap_r-2.5.so.0 /usr/lib/x86_64-linux-gnu/libldap_r-2.4.so.2 && \
    rm -rf /var/lib/apt/lists/*
EXPOSE 5050
EXPOSE 5051

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["apps/api-gateway/FgLabel.Api.csproj", "apps/api-gateway/"]
COPY ["apps/shared/FgLabel.Shared/FgLabel.Shared.csproj", "apps/shared/FgLabel.Shared/"]
COPY [".env", "/app/.env"]
RUN dotnet restore "apps/api-gateway/FgLabel.Api.csproj"
COPY . .
WORKDIR "/src/apps/api-gateway"
RUN dotnet build "FgLabel.Api.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "FgLabel.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
COPY --from=build /app/.env .
ENV ASPNETCORE_URLS=http://+:5050
ENTRYPOINT ["dotnet", "FgLabel.Api.dll"]

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD wget -qO- http://localhost:5050/healthz || exit 1 