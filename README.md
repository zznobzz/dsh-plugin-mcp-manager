# dsh-plugin-mcp-manager

Управление подключениями **MCP** (Model Context Protocol) в [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): страница **Настройки → MCP** и инструмент агента `mcp_connections`.

MCP connections manager for DeepSeek Harness: a Settings → MCP page plus an `mcp_connections` agent tool, both backed by one operation set.

- Web-страница в стиле штатных настроек (ru/en), живой статус соединений;
- добавление, редактирование, удаление, включение и отключение серверов без перезапуска приложения;
- транспорты **Streamable HTTP** (`url`, `headers`) и **stdio** (`command`, `args`, `env`, `cwd`);
- кнопка **Проверить** — разовое подключение черновика с выводом списка инструментов;
- инструменты сервера доступны агенту как `mcp__<serverName>__<tool>`; MCP-ресурсы — через `list_mcp_resources`;
- тот же набор операций доступен агенту инструментом `mcp_connections`.

## Установка

В приложении: **Настройки → Плагины → Установить** (репозиторий или локальная папка).

Или из GitHub:

```
dsh plugin --profile <profile> add github:zznobzz/dsh-plugin-mcp-manager
```

или через `plugin_manager` в агенте:

```
install_bundle  target: github:zznobzz/dsh-plugin-mcp-manager
```

Локальная разработка: скопируйте каталог и поставьте его как локальный бандл
(`install_bundle target: <абсолютный путь>`); при установке из локальной папки плагин
подключается ссылкой, изменения хост-части применяются после перезапуска плагина
(выключить/включить строку в Настройки → Плагины), клиентской — после обновления страницы.

## Использование

### Через настройки

**Настройки → MCP → Добавить сервер**:

| Поле | Значение |
| --- | --- |
| Имя сервера | префикс инструментов, `^[A-Za-z0-9_-]{1,32}$`, уникальный |
| Транспорт | Streamable HTTP — `url` + необязательные `headers`; STDIO — `command` + `args`, `env`, `cwd` |
| Таймаут вызова | мс, по умолчанию 60000 |

Строка в списке показывает статус (`Подключено`, `Подключение…`, `Ошибка`, `Отключено`),
число инструментов и текст ошибки; кнопки «Проверить», «Изменить», «Удалить» и переключатель.

### Через агента

```
mcp_connections action=list
mcp_connections action=add server={serverName:"demo", transport:"stdio",
  command:"npx", args:["-y","@modelcontextprotocol/server-everything"]}
mcp_connections action=test server={serverName:"probe", transport:"streamable-http",
  url:"https://example.com/mcp"}
mcp_connections action=disable id=<id>
mcp_connections action=remove  id=<id>
```

### Внешние подключения (настроенные до установки плагина)

Если MCP-серверы уже были подключены в профиле — строкой `@deepseek-ai/dsh-mcp-client`
в `cordis.patch.yml` или в установленном бандле, — плагин находит их сам и показывает
отдельным блоком **«Настроены вне плагина»**:

- имя, транспорт, цель, живой статус и список инструментов — как у обычных подключений;
- переключатель включения/отключения сохраняется штатным Plugin Manager (строка остаётся
  в своей конфигурации);
- редактировать и удалять такие строки плагин не даёт — их владелец это профиль/бандл;
  в UI и в `list` они помечены как `external`;
- повторный `serverName` отклоняется: подключать тот же сервер ещё раз через плагин
  нельзя, иначе имена инструментов `mcp__<serverName>__*` конфликтуют.

Через агента: `mcp_connections action=disable id=include:<row-id>` (id строки виден в `list`).

## Хранение

Определения подключений: `$DSH_HOME/plugins/mcp-manager/servers.json`
(создаётся с правами `0600`). Файл читается при старте профиля и переписывается
каждым изменением из UI или инструмента. Секреты в `env`/`headers` лежат в этом файле
и не маскируются в интерфейсе.

## Как устроено

- **Host** (`index.js`): хранит список, монтирует по одному экземпляру
  `@deepseek-ai/dsh-mcp-client` на включённый сервер через `ctx.plugin()`,
  собирает статусы и имена инструментов, отдаёт REST-подобные эндпоинты
  `/api/mcp-manager.list|save|remove|setEnabled|setExternalEnabled|test` на общем канале `connection.fetch`
  и регистрирует инструмент `mcp_connections`. Строки `@deepseek-ai/dsh-mcp-client`,
  настроенные вне плагина, читаются через сервисы `configEditor` (конфигурация) и
  `pluginManager` (включённость, состояние, диагностика) и не монтируются повторно.
- **Client** (`client.js`): регистрируется в слоты `settings.section` (id `mcp`) и
  `settings.section.icon`, вызывает хостовые эндпоинты через `ctx.connection.rpc.call`.
- Модуль `@deepseek-ai/dsh-mcp-client` резолвится динамическим импортом: сначала по
  имени пакета, затем по путям установки DSH (`resources/app.asar/dsh/node_modules/...`,
  распакованные и CLI-варианты) — см. `mcpClientCandidates()` в `index.js`.

## Проверка

В репозитории лежит `test/mcp-demo-server.mjs` — минимальный локальный MCP-сервер
(stdio, инструмент `echo`). Он не входит в устанавливаемый пакет (см. `files`):

```
node test/mcp-demo-server.mjs
```

Сценарий: добавить подключение (stdio, command — путь к `node`, args — путь к этому файлу),
дождаться статуса `Подключено`, убедиться, что агент видит `mcp__<serverName>__echo`,
выключить сервер и проверить, что инструмент исчез.

## Ограничения

- Одно подключение = один `serverName`; имена инструментов глобальны для профиля.
- Значения `env`/`headers` хранятся в открытом виде в файле определений.
- Плагин не расширяет права сервера MCP: он только запускает штатный клиент и показывает его состояние.
- Блок «Настроены вне плагина» работает при доступных сервисах `configEditor` и `pluginManager`
  (обычный web/desktop профиль). Без них внешние строки не обнаруживаются, а управляемые
  подключения плагина продолжают работать.

## Лицензия

MIT — см. [LICENSE](LICENSE).
