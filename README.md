# IronLog — Telegram Mini App

Отдельная Telegram-версия IronLog. Исходный iOS-проект `outputs/IronLog` не изменяется.

## Что работает

- программы тренировок и их расписание;
- редактор упражнений, подходов, повторов и RIR;
- активная тренировка с 90-секундным таймером отдыха;
- история и график прогресса;
- локальное хранение в Telegram Device Storage с резервным localStorage;
- экспорт полной резервной копии в JSON;
- экспорт истории в CSV;
- импорт и восстановление из JSON-файла;
- тема, safe area, профиль и тактильные отклики Telegram.

## Подключение к Telegram

1. Разместить содержимое папки `public` на HTTPS-адресе.
2. Открыть `@BotFather` и выбрать `/mybots` → нужный бот → **Bot Settings** → **Configure Mini App** → **Enable Mini App**.
3. Указать HTTPS-адрес `index.html` как URL Mini App.

Основной файл приложения: `public/index.html`.
