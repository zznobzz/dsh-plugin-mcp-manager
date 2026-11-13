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

## Хранение

Определения подключений: `$DSH_HOME/plugins/mcp-manager/servers.json`
(создаётся с правами `0600`). Файл читается при старте профиля и переписывается
каждым изменением из UI или инструмента. Секреты в `env`/`headers` лежат в этом файле
и не маскируются в интерфейсе.

## Как устроено

- **Host** (`index.js`): хранит список, монтирует по одному экземпляру
  `@deepseek-ai/dsh-mcp-client` на включённый сервер через `ctx.plugin()`,
  собирает статусы и имена инструментов, отдаёт REST-подобные эндпоинты
  `/api/mcp-manager.list|save|remove|setEnabled|test` на общем канале `connection.fetch`
  и регистрирует инструмент `mcp_connections`.
- **Client** (`client.js`): регистрируется в слоты `settings.section` (id `mcp`) и
  `settings.section.icon`, вызывает хостовые эндпоинты через `ctx.connection.rpc.call`.
- Модуль `@deepseek-ai/dsh-mcp-client` резолвится динамическим импортом: сначала по
  имени пакета, затем по путям установки DSH (`resources/app.asar/dsh/node_modules/...`,
  распакованные и CLI-варианты) — см. `mcpClientCandidates()` в `index.js`.

## Проверка

`test/mcp-demo-server.mjs` — минимальный локальный MCP-сервер (stdio, инструмент `echo`):

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

## Лицензия

MIT — см. [LICENSE](LICENSE).
