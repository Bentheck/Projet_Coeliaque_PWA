// PATH: Projet_Coeliaque_PWA.Server/DTOs/RemovedRowsUpdateDto.cs
using System.Collections.Generic;

namespace Projet_Coeliaque_PWA.Server.DTOs
{
    public class RemovedRowsUpdateDto
    {
        public List<string> RemovedRowKeys { get; set; } = new();
    }
}
