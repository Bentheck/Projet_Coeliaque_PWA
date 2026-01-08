using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace Projet_Coeliaque_PWA.Server.Infrastructure
{
    public class QueuedHostedService : BackgroundService
    {
        private readonly IBackgroundTaskQueue _queue;
        private readonly ILogger<QueuedHostedService> _logger;

        public QueuedHostedService(IBackgroundTaskQueue queue, ILogger<QueuedHostedService> logger)
        {
            _queue = queue;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("QueuedHostedService démarré.");

            while (!stoppingToken.IsCancellationRequested)
            {
                Func<CancellationToken, Task>? workItem = null;

                try
                {
                    workItem = await _queue.DequeueAsync(stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Erreur lors de la lecture dans la file de tâches.");
                }

                if (workItem == null) continue;

                try
                {
                    await workItem(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Tâche de fond en erreur.");
                }
            }

            _logger.LogInformation("QueuedHostedService arrêté.");
        }
    }
}
